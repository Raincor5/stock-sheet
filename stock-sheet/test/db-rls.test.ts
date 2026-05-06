import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Json =
	| string
	| number
	| boolean
	| null
	| { [key: string]: Json | undefined }
	| Json[];

const supabaseUrl =
	process.env.SUPABASE_LOCAL_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey =
	process.env.REACT_APP_SUPABASE_ANON_KEY ||
	process.env.SUPABASE_LOCAL_ANON_KEY ||
	process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

assert.ok(supabaseUrl, 'Missing local Supabase URL for DB tests');
assert.ok(anonKey, 'Missing anon/publishable key for DB tests');
assert.ok(serviceRoleKey, 'Missing service role key for DB tests');

function createAnonClient() {
	return createClient(supabaseUrl!, anonKey!, {
		auth: {
			autoRefreshToken: false,
			detectSessionInUrl: false,
			persistSession: false,
		},
	});
}

const adminClient = createClient(supabaseUrl!, serviceRoleKey!, {
	auth: {
		autoRefreshToken: false,
		detectSessionInUrl: false,
		persistSession: false,
	},
});

interface TestUser {
	id: string;
	email: string;
	password: string;
}

async function createTestUser(label: string): Promise<TestUser> {
	const suffix = randomUUID().slice(0, 8);
	const email = `${label}-${suffix}@example.com`;
	const password = `P@ss-${suffix}-123`;
	const { data, error } = await adminClient.auth.admin.createUser({
		email,
		password,
		email_confirm: true,
	});

	if (error || !data.user) {
		throw new Error(`Failed to create test user ${label}: ${error?.message ?? 'unknown error'}`);
	}

	return {
		id: data.user.id,
		email,
		password,
	};
}

async function signInUser(email: string, password: string) {
	const client = createAnonClient();
	const { error } = await client.auth.signInWithPassword({ email, password });

	if (error) {
		throw new Error(`Failed to sign in ${email}: ${error.message}`);
	}

	return client;
}

async function cleanupFixture(storeIds: string[], userIds: string[]) {
	if (storeIds.length > 0) {
		const { error } = await adminClient.from('stores').delete().in('id', storeIds);
		if (error) {
			throw new Error(`Failed to delete test stores: ${error.message}`);
		}
	}

	for (const userId of userIds) {
		const { error } = await adminClient.auth.admin.deleteUser(userId);
		if (error) {
			throw new Error(`Failed to delete test user ${userId}: ${error.message}`);
		}
	}
}

async function bootstrapOwnerStore(
	ownerClient: SupabaseClient,
	owner: TestUser,
	label: string
) {
	const { data: store, error: storeError } = await ownerClient
		.from('stores')
		.insert([{ name: `RLS ${label} ${randomUUID().slice(0, 6)}` }])
		.select()
		.single();

	if (storeError || !store) {
		throw new Error(`Failed to create store: ${storeError?.message ?? 'unknown error'}`);
	}

	const { data: ownerRole, error: roleError } = await ownerClient
		.from('store_roles')
		.select('*')
		.eq('store_id', store.id)
		.eq('slug', 'owner')
		.single();

	if (roleError || !ownerRole) {
		throw new Error(`Failed to fetch owner role: ${roleError?.message ?? 'unknown error'}`);
	}

	const { error: membershipError } = await ownerClient.from('store_members').insert([
		{
			store_id: store.id,
			user_id: owner.id,
			member_email: owner.email.toLowerCase(),
			role_id: ownerRole.id,
		},
	]);

	if (membershipError) {
		throw new Error(`Failed to bootstrap owner membership: ${membershipError.message}`);
	}

	const { data: employeeRole, error: employeeRoleError } = await ownerClient
		.from('store_roles')
		.select('*')
		.eq('store_id', store.id)
		.eq('slug', 'employee')
		.single();

	if (employeeRoleError || !employeeRole) {
		throw new Error(
			`Failed to fetch employee role: ${employeeRoleError?.message ?? 'unknown error'}`
		);
	}

	return {
		store,
		ownerRole,
		employeeRole,
	};
}

async function createTemplate(ownerClient: SupabaseClient, storeId: string, label: string) {
	const { data, error } = await ownerClient
		.from('sheet_templates')
		.insert([
			{
				store_id: storeId,
				name: `Template ${label} ${randomUUID().slice(0, 5)}`,
				columns: [
					{ id: 'count', label: 'Count', order: 1, fieldType: 'number' },
					{ id: 'note', label: 'Note', order: 2, fieldType: 'text' },
				] as Json,
			},
		])
		.select()
		.single();

	if (error || !data) {
		throw new Error(`Failed to create template: ${error?.message ?? 'unknown error'}`);
	}

	return data;
}

async function createProduct(ownerClient: SupabaseClient, storeId: string, label: string) {
	const { data, error } = await ownerClient
		.from('products')
		.insert([
			{
				store_id: storeId,
				name: `Product ${label} ${randomUUID().slice(0, 5)}`,
			},
		])
		.select()
		.single();

	if (error || !data) {
		throw new Error(`Failed to create product: ${error?.message ?? 'unknown error'}`);
	}

	return data;
}

async function inviteEmployeeAndAccept(
	ownerClient: SupabaseClient,
	employeeClient: SupabaseClient,
	owner: TestUser,
	employee: TestUser,
	storeId: string,
	employeeRoleId: string
) {
	const { data: invite, error: inviteError } = await ownerClient
		.from('store_invites')
		.insert([
			{
				store_id: storeId,
				email: employee.email.toLowerCase(),
				role_id: employeeRoleId,
				invited_by_user_id: owner.id,
			},
		])
		.select()
		.single();

	if (inviteError || !invite) {
		throw new Error(`Failed to create invite: ${inviteError?.message ?? 'unknown error'}`);
	}

	const { data: visibleInvites, error: visibleInvitesError } = await employeeClient
		.from('store_invites')
		.select('*')
		.eq('status', 'pending');

	if (visibleInvitesError) {
		throw new Error(`Failed to read pending invites: ${visibleInvitesError.message}`);
	}

	assert.equal(visibleInvites?.length, 1);
	assert.equal(visibleInvites?.[0]?.id, invite.id);

	const { error: memberInsertError } = await employeeClient.from('store_members').insert([
		{
			store_id: storeId,
			user_id: employee.id,
			member_email: employee.email.toLowerCase(),
			role_id: employeeRoleId,
		},
	]);

	if (memberInsertError) {
		throw new Error(`Failed to accept invite membership: ${memberInsertError.message}`);
	}

	const { error: inviteUpdateError } = await employeeClient
		.from('store_invites')
		.update({
			status: 'accepted',
			responded_at: new Date().toISOString(),
		})
		.eq('id', invite.id);

	if (inviteUpdateError) {
		throw new Error(`Failed to mark invite accepted: ${inviteUpdateError.message}`);
	}

	return invite;
}

test('RLS only exposes stores to their members', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const ownerA = await createTestUser('owner-a');
		const ownerB = await createTestUser('owner-b');
		userIds.push(ownerA.id, ownerB.id);

		const ownerAClient = await signInUser(ownerA.email, ownerA.password);
		const ownerBClient = await signInUser(ownerB.email, ownerB.password);

		const { store: storeA } = await bootstrapOwnerStore(ownerAClient, ownerA, 'A');
		const { store: storeB } = await bootstrapOwnerStore(ownerBClient, ownerB, 'B');
		storeIds.push(storeA.id, storeB.id);

		const { data: visibleStores, error } = await ownerAClient
			.from('stores')
			.select('id, name')
			.order('name', { ascending: true });

		assert.equal(error, null);
		assert.deepEqual(
			(visibleStores ?? []).map((store) => store.id),
			[storeA.id]
		);

		const { data: hiddenStoreRows, error: hiddenStoreError } = await ownerAClient
			.from('stores')
			.select('id')
			.eq('id', storeB.id);

		assert.equal(hiddenStoreError, null);
		assert.equal(hiddenStoreRows?.length ?? 0, 0);
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

test('invited employees can self-accept pending invites and then read the store', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const owner = await createTestUser('owner-invite');
		const employee = await createTestUser('employee-invite');
		userIds.push(owner.id, employee.id);

		const ownerClient = await signInUser(owner.email, owner.password);
		const employeeClient = await signInUser(employee.email, employee.password);

		const { store, employeeRole } = await bootstrapOwnerStore(ownerClient, owner, 'invite');
		storeIds.push(store.id);

		await inviteEmployeeAndAccept(
			ownerClient,
			employeeClient,
			owner,
			employee,
			store.id,
			employeeRole.id
		);

		const { data: stores, error } = await employeeClient.from('stores').select('id');
		assert.equal(error, null);
		assert.ok((stores ?? []).some((candidate) => candidate.id === store.id));
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

test('employees cannot create templates but can create sheet instances by default', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const owner = await createTestUser('owner-doc');
		const employee = await createTestUser('employee-doc');
		userIds.push(owner.id, employee.id);

		const ownerClient = await signInUser(owner.email, owner.password);
		const employeeClient = await signInUser(employee.email, employee.password);

		const { store, employeeRole } = await bootstrapOwnerStore(ownerClient, owner, 'doc');
		storeIds.push(store.id);

		const template = await createTemplate(ownerClient, store.id, 'doc');
		await inviteEmployeeAndAccept(
			ownerClient,
			employeeClient,
			owner,
			employee,
			store.id,
			employeeRole.id
		);

		const deniedTemplateInsert = await employeeClient
			.from('sheet_templates')
			.insert([
				{
					store_id: store.id,
					name: `Denied ${randomUUID().slice(0, 4)}`,
					columns: [] as Json,
				},
			])
			.select()
			.single();

		assert.ok(deniedTemplateInsert.error, 'Expected template insert to be denied by RLS');

		const { data: sheet, error: sheetError } = await employeeClient
			.from('sheet_instances')
			.insert([
				{
					store_id: store.id,
					sheet_template_id: template.id,
					date: `2026-05-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`,
				},
			])
			.select()
			.single();

		assert.equal(sheetError, null);
		assert.ok(sheet?.id);
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

test('template overrides can block employee create and view access', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const owner = await createTestUser('owner-override');
		const employee = await createTestUser('employee-override');
		userIds.push(owner.id, employee.id);

		const ownerClient = await signInUser(owner.email, owner.password);
		const employeeClient = await signInUser(employee.email, employee.password);

		const { store, employeeRole } = await bootstrapOwnerStore(ownerClient, owner, 'override');
		storeIds.push(store.id);

		const template = await createTemplate(ownerClient, store.id, 'override');
		await inviteEmployeeAndAccept(
			ownerClient,
			employeeClient,
			owner,
			employee,
			store.id,
			employeeRole.id
		);

		const { error: overrideError } = await ownerClient
			.from('sheet_template_role_overrides')
			.insert([
				{
					sheet_template_id: template.id,
					store_role_id: employeeRole.id,
					permissions: {
						viewDocuments: false,
						createDocuments: false,
						editDocuments: false,
					} as Json,
				},
			]);

		assert.equal(overrideError, null);

		const { data: invisibleTemplates, error: invisibleTemplatesError } = await employeeClient
			.from('sheet_templates')
			.select('id')
			.eq('id', template.id);

		assert.equal(invisibleTemplatesError, null);
		assert.equal(invisibleTemplates?.length ?? 0, 0);

		const deniedSheetInsert = await employeeClient
			.from('sheet_instances')
			.insert([
				{
					store_id: store.id,
					sheet_template_id: template.id,
					date: `2026-06-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`,
				},
			])
			.select()
			.single();

		assert.ok(deniedSheetInsert.error, 'Expected sheet creation to be denied by override');
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

test('locked sheets reject employee entry edits at the database layer', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const owner = await createTestUser('owner-lock');
		const employee = await createTestUser('employee-lock');
		userIds.push(owner.id, employee.id);

		const ownerClient = await signInUser(owner.email, owner.password);
		const employeeClient = await signInUser(employee.email, employee.password);

		const { store, employeeRole } = await bootstrapOwnerStore(ownerClient, owner, 'lock');
		storeIds.push(store.id);

		const template = await createTemplate(ownerClient, store.id, 'lock');
		const product = await createProduct(ownerClient, store.id, 'lock');
		await inviteEmployeeAndAccept(
			ownerClient,
			employeeClient,
			owner,
			employee,
			store.id,
			employeeRole.id
		);

		const { data: sheet, error: sheetError } = await employeeClient
			.from('sheet_instances')
			.insert([
				{
					store_id: store.id,
					sheet_template_id: template.id,
					date: `2026-07-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`,
				},
			])
			.select()
			.single();

		assert.equal(sheetError, null);
		assert.ok(sheet);

		const { data: entry, error: entryError } = await employeeClient
			.from('sheet_entries')
			.insert([
				{
					sheet_id: sheet!.id,
					product_id: product.id,
					column_id: 'count',
					value: '3',
				},
			])
			.select()
			.single();

		assert.equal(entryError, null);
		assert.ok(entry?.id);

		const { error: lockError } = await ownerClient
			.from('sheet_instances')
			.update({ is_locked: true })
			.eq('id', sheet!.id)
			.select()
			.single();

		assert.equal(lockError, null);

		const deniedEntryInsert = await employeeClient
			.from('sheet_entries')
			.insert([
				{
					sheet_id: sheet!.id,
					product_id: product.id,
					column_id: 'note',
					value: 'Should fail',
				},
			])
			.select()
			.single();

		assert.ok(deniedEntryInsert.error, 'Expected entry insert to be denied for locked sheet');
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

test('owners keep document access even if dirty owner override rows exist', async () => {
	const storeIds: string[] = [];
	const userIds: string[] = [];

	try {
		const owner = await createTestUser('owner-dirty-override');
		userIds.push(owner.id);

		const ownerClient = await signInUser(owner.email, owner.password);
		const { store, ownerRole } = await bootstrapOwnerStore(ownerClient, owner, 'dirty-override');
		storeIds.push(store.id);

		const template = await createTemplate(ownerClient, store.id, 'dirty-override');

		const { error: dirtyOverrideError } = await adminClient
			.from('sheet_template_role_overrides')
			.insert([
				{
					sheet_template_id: template.id,
					store_role_id: ownerRole.id,
					permissions: {
						viewDocuments: false,
						createDocuments: false,
						editDocuments: false,
					} as Json,
				},
			]);

		assert.equal(dirtyOverrideError, null);

		const { data: visibleTemplates, error: visibleTemplatesError } = await ownerClient
			.from('sheet_templates')
			.select('id')
			.eq('id', template.id);

		assert.equal(visibleTemplatesError, null);
		assert.equal(visibleTemplates?.length ?? 0, 1);

		const { data: createdSheet, error: createdSheetError } = await ownerClient
			.from('sheet_instances')
			.insert([
				{
					store_id: store.id,
					sheet_template_id: template.id,
					date: `2026-08-${String(Math.floor(Math.random() * 20) + 10).padStart(2, '0')}`,
				},
			])
			.select()
			.single();

		assert.equal(createdSheetError, null);
		assert.ok(createdSheet?.id);
	} finally {
		await cleanupFixture(storeIds, userIds);
	}
});

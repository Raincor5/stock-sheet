import assert from 'node:assert/strict';
import test from 'node:test';
import {
	getDefaultPermissionsForRole,
	getEffectivePermissions,
	hasManagementAccess,
	normalizeStoreRoleKey,
	sanitizePermissionPatch,
	togglePermissionValue,
} from './permissions.ts';

test('normalizeStoreRoleKey maps legacy and unknown roles safely', () => {
	assert.equal(normalizeStoreRoleKey('owner'), 'owner');
	assert.equal(normalizeStoreRoleKey('staff'), 'employee');
	assert.equal(normalizeStoreRoleKey('something-else'), 'employee');
});

test('togglePermissionValue enables view when a dependent document permission is enabled', () => {
	const base = {
		...getDefaultPermissionsForRole('employee'),
		viewDocuments: false,
		createDocuments: false,
		editDocuments: false,
		lockDocuments: false,
		archiveDocuments: false,
	};

	const next = togglePermissionValue(base, 'editDocuments');

	assert.equal(next.editDocuments, true);
	assert.equal(next.viewDocuments, true);
});

test('togglePermissionValue clears dependent document permissions when view is turned off', () => {
	const base = {
		...getDefaultPermissionsForRole('manager'),
		viewDocuments: true,
		createDocuments: true,
		editDocuments: true,
		lockDocuments: true,
		archiveDocuments: true,
	};

	const next = togglePermissionValue(base, 'viewDocuments');

	assert.equal(next.viewDocuments, false);
	assert.equal(next.createDocuments, false);
	assert.equal(next.editDocuments, false);
	assert.equal(next.lockDocuments, false);
	assert.equal(next.archiveDocuments, false);
});

test('sanitizePermissionPatch carries view dependency when edit is enabled', () => {
	const patch = sanitizePermissionPatch(
		{ editDocuments: true },
		['viewDocuments', 'editDocuments']
	);

	assert.deepEqual(patch, {
		viewDocuments: true,
		editDocuments: true,
	});
});

test('getEffectivePermissions merges overrides over the base role', () => {
	const permissions = getEffectivePermissions(
		{
			viewDocuments: true,
			createDocuments: true,
			editDocuments: true,
			lockDocuments: false,
			archiveDocuments: false,
			manageTemplates: false,
			manageMembers: false,
			inviteMembers: false,
			manageRoles: false,
			manageDocumentPermissions: false,
		},
		'employee',
		{
			createDocuments: false,
			lockDocuments: true,
		}
	);

	assert.equal(permissions.viewDocuments, true);
	assert.equal(permissions.createDocuments, false);
	assert.equal(permissions.lockDocuments, true);
});

test('hasManagementAccess works for both role keys and permission objects', () => {
	assert.equal(hasManagementAccess('owner'), true);
	assert.equal(hasManagementAccess('employee'), false);
	assert.equal(
		hasManagementAccess({
			...getDefaultPermissionsForRole('employee'),
			manageTemplates: true,
		}),
		true
	);
});

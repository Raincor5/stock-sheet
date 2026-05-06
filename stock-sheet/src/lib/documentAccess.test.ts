import assert from 'node:assert/strict';
import test from 'node:test';
import {
	filterSheetsByPermission,
	filterTemplatesByPermission,
	getTemplatePermissions,
} from './documentAccess.ts';
import { getDefaultPermissionsForRole } from './permissions.ts';

const membership = {
	role_id: 'role-employee',
	roleSlug: 'employee',
	permissions: getDefaultPermissionsForRole('employee'),
};

const ownerMembership = {
	role_id: 'role-owner',
	roleSlug: 'owner',
	permissions: getDefaultPermissionsForRole('owner'),
};

test('getTemplatePermissions returns base permissions when there is no override', () => {
	const permissions = getTemplatePermissions('template-a', membership, []);

	assert.equal(permissions?.viewDocuments, true);
	assert.equal(permissions?.createDocuments, true);
	assert.equal(permissions?.lockDocuments, false);
});

test('filterTemplatesByPermission honors a template-level create override', () => {
	const templates = [{ id: 'template-a' }, { id: 'template-b' }];
	const overrides = [
		{
			sheet_template_id: 'template-b',
			store_role_id: membership.role_id,
			permissions: {
				createDocuments: false,
			},
		},
	];

	const creatableTemplates = filterTemplatesByPermission(
		templates,
		membership,
		overrides,
		'createDocuments'
	);

	assert.deepEqual(
		creatableTemplates.map((template) => template.id),
		['template-a']
	);
});

test('filterSheetsByPermission hides sheets when a template override removes view access', () => {
	const sheets = [
		{ id: 'sheet-a', sheet_template_id: 'template-a' },
		{ id: 'sheet-b', sheet_template_id: 'template-b' },
	];
	const overrides = [
		{
			sheet_template_id: 'template-b',
			store_role_id: membership.role_id,
			permissions: {
				viewDocuments: false,
			},
		},
	];

	const visibleSheets = filterSheetsByPermission(
		sheets,
		membership,
		overrides,
		'viewDocuments'
	);

	assert.deepEqual(
		visibleSheets.map((sheet) => sheet.id),
		['sheet-a']
	);
});

test('getTemplatePermissions returns null when the user has no membership', () => {
	assert.equal(getTemplatePermissions('template-a', null, []), null);
});

test('owner memberships ignore template overrides and keep base access', () => {
	const permissions = getTemplatePermissions(
		'template-a',
		ownerMembership,
		[
			{
				sheet_template_id: 'template-a',
				store_role_id: ownerMembership.role_id,
				permissions: {
					viewDocuments: false,
					createDocuments: false,
					editDocuments: false,
				},
			},
		]
	);

	assert.equal(permissions?.viewDocuments, true);
	assert.equal(permissions?.createDocuments, true);
	assert.equal(permissions?.editDocuments, true);
});

import type { Json } from '@/types/supabase';

export type StoreRoleKey = 'owner' | 'manager' | 'employee';
export type StoreRolePermissionKey = keyof StoreRolePermissions;

export interface StoreRolePermissions {
	viewDocuments: boolean;
	createDocuments: boolean;
	editDocuments: boolean;
	lockDocuments: boolean;
	archiveDocuments: boolean;
	manageTemplates: boolean;
	manageMembers: boolean;
	inviteMembers: boolean;
	manageRoles: boolean;
	manageDocumentPermissions: boolean;
}

export const DOCUMENT_PERMISSION_KEYS: StoreRolePermissionKey[] = [
	'viewDocuments',
	'createDocuments',
	'editDocuments',
	'lockDocuments',
	'archiveDocuments',
];

const DOCUMENT_ACTION_PERMISSION_KEYS: StoreRolePermissionKey[] = [
	'createDocuments',
	'editDocuments',
	'lockDocuments',
	'archiveDocuments',
];

export const PERMISSION_LABELS: Record<keyof StoreRolePermissions, string> = {
	viewDocuments: 'View Documents',
	createDocuments: 'Create Documents',
	editDocuments: 'Edit Documents',
	lockDocuments: 'Lock Documents',
	archiveDocuments: 'Archive Documents',
	manageTemplates: 'Manage Templates',
	manageMembers: 'Manage Members',
	inviteMembers: 'Invite Members',
	manageRoles: 'Manage Roles',
	manageDocumentPermissions: 'Manage Document Permissions',
};

const OWNER_PERMISSIONS: StoreRolePermissions = {
	viewDocuments: true,
	createDocuments: true,
	editDocuments: true,
	lockDocuments: true,
	archiveDocuments: true,
	manageTemplates: true,
	manageMembers: true,
	inviteMembers: true,
	manageRoles: true,
	manageDocumentPermissions: true,
};

const MANAGER_PERMISSIONS: StoreRolePermissions = {
	viewDocuments: true,
	createDocuments: true,
	editDocuments: true,
	lockDocuments: true,
	archiveDocuments: true,
	manageTemplates: true,
	manageMembers: false,
	inviteMembers: false,
	manageRoles: false,
	manageDocumentPermissions: false,
};

const EMPLOYEE_PERMISSIONS: StoreRolePermissions = {
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
};

export function getDefaultPermissionsForRole(roleKey: StoreRoleKey): StoreRolePermissions {
	switch (roleKey) {
		case 'owner':
			return { ...OWNER_PERMISSIONS };
		case 'manager':
			return { ...MANAGER_PERMISSIONS };
		default:
			return { ...EMPLOYEE_PERMISSIONS };
	}
}

export function normalizeStoreRoleKey(value: string | null | undefined): StoreRoleKey {
	if (value === 'owner' || value === 'manager' || value === 'employee') {
		return value;
	}

	if (value === 'staff') {
		return 'employee';
	}

	return 'employee';
}

export function normalizeStoreRoleSlug(value: string | null | undefined) {
	return (value ?? '').trim().toLowerCase();
}

export function normalizePermissions(
	value: Json | null | undefined,
	fallbackRole: string | null | undefined = 'employee'
): StoreRolePermissions {
	const base = getDefaultPermissionsForRole(normalizeStoreRoleKey(fallbackRole));

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return base;
	}

	const record = value as Record<string, unknown>;
	return {
		viewDocuments: typeof record.viewDocuments === 'boolean' ? record.viewDocuments : base.viewDocuments,
		createDocuments: typeof record.createDocuments === 'boolean' ? record.createDocuments : base.createDocuments,
		editDocuments: typeof record.editDocuments === 'boolean' ? record.editDocuments : base.editDocuments,
		lockDocuments: typeof record.lockDocuments === 'boolean' ? record.lockDocuments : base.lockDocuments,
		archiveDocuments: typeof record.archiveDocuments === 'boolean' ? record.archiveDocuments : base.archiveDocuments,
		manageTemplates: typeof record.manageTemplates === 'boolean' ? record.manageTemplates : base.manageTemplates,
		manageMembers: typeof record.manageMembers === 'boolean' ? record.manageMembers : base.manageMembers,
		inviteMembers: typeof record.inviteMembers === 'boolean' ? record.inviteMembers : base.inviteMembers,
		manageRoles: typeof record.manageRoles === 'boolean' ? record.manageRoles : base.manageRoles,
		manageDocumentPermissions:
			typeof record.manageDocumentPermissions === 'boolean'
				? record.manageDocumentPermissions
				: base.manageDocumentPermissions,
	};
}

export function mergePermissions(
	base: StoreRolePermissions,
	override: Json | null | undefined
): StoreRolePermissions {
	if (!override || typeof override !== 'object' || Array.isArray(override)) {
		return base;
	}

	const record = override as Record<string, unknown>;
	const merged = { ...base };

	(Object.keys(merged) as Array<keyof StoreRolePermissions>).forEach((key) => {
		if (typeof record[key] === 'boolean') {
			merged[key] = record[key] as boolean;
		}
	});

	return merged;
}

export function normalizePermissionDependencies(
	permissions: StoreRolePermissions
): StoreRolePermissions {
	const normalized = { ...permissions };
	const hasEnabledDocumentAction = DOCUMENT_ACTION_PERMISSION_KEYS.some(
		(key) => normalized[key]
	);

	if (!normalized.viewDocuments) {
		DOCUMENT_ACTION_PERMISSION_KEYS.forEach((key) => {
			normalized[key] = false;
		});
	}

	if (hasEnabledDocumentAction) {
		normalized.viewDocuments = true;
	}

	return normalized;
}

export function togglePermissionValue(
	permissions: StoreRolePermissions,
	key: StoreRolePermissionKey
) {
	const next = {
		...permissions,
		[key]: !permissions[key],
	};

	if (key === 'viewDocuments' && permissions.viewDocuments) {
		DOCUMENT_ACTION_PERMISSION_KEYS.forEach((actionKey) => {
			next[actionKey] = false;
		});
	}

	if (DOCUMENT_ACTION_PERMISSION_KEYS.includes(key) && next[key]) {
		next.viewDocuments = true;
	}

	return normalizePermissionDependencies(next);
}

export function getEffectivePermissions(
	basePermissions: Json | null | undefined,
	roleSlug: string | null | undefined,
	override: Json | null | undefined = null
) {
	return mergePermissions(normalizePermissions(basePermissions, roleSlug), override);
}

export function sanitizePermissionPatch(
	value: Partial<Record<StoreRolePermissionKey, boolean>>,
	keys: StoreRolePermissionKey[] = Object.keys(PERMISSION_LABELS) as StoreRolePermissionKey[]
) {
	const constrainedValue = normalizePermissionDependencies({
		...getDefaultPermissionsForRole('employee'),
		...value,
	});
	const patch: Record<string, boolean> = {};
	const shouldIncludeViewDependency = DOCUMENT_ACTION_PERMISSION_KEYS.some(
		(key) => value[key] === true
	);
	const shouldClearDocumentActions = value.viewDocuments === false;

	keys.forEach((key) => {
		if (
			typeof value[key] === 'boolean' ||
			(key === 'viewDocuments' && shouldIncludeViewDependency) ||
			(shouldClearDocumentActions && DOCUMENT_ACTION_PERMISSION_KEYS.includes(key))
		) {
			patch[key] = constrainedValue[key];
		}
	});

	return patch;
}

export function slugifyRoleName(value: string) {
	return value
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 40);
}

export function hasPermission(
	permissions: StoreRolePermissions | null | undefined,
	key: StoreRolePermissionKey
) {
	return Boolean(permissions?.[key]);
}

export function hasManagementAccess(
	roleOrPermissions: string | StoreRolePermissions | null | undefined
) {
	if (!roleOrPermissions) {
		return false;
	}

	if (typeof roleOrPermissions === 'string') {
		const normalized = normalizeStoreRoleKey(roleOrPermissions);
		return normalized === 'owner' || normalized === 'manager';
	}

	return (
		roleOrPermissions.manageTemplates ||
		roleOrPermissions.manageMembers ||
		roleOrPermissions.manageRoles ||
		roleOrPermissions.manageDocumentPermissions
	);
}

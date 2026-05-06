import {
	hasPermission,
	mergePermissions,
	type StoreRolePermissionKey,
	type StoreRolePermissions,
} from './permissions.ts';

export interface StoreMembershipLike {
	role_id: string;
	roleSlug?: string | null;
	permissions: StoreRolePermissions;
}

export interface TemplateOverrideLike {
	sheet_template_id: string;
	store_role_id: string;
	permissions: Partial<Record<StoreRolePermissionKey, boolean>>;
}

export function getTemplatePermissions(
	templateId: string,
	membership: StoreMembershipLike | null | undefined,
	overrides: TemplateOverrideLike[] | null | undefined
) {
	if (!membership) {
		return null;
	}

	if ((membership.roleSlug ?? '').trim().toLowerCase() === 'owner') {
		return membership.permissions;
	}

	const override = (overrides ?? []).find(
		(candidate) =>
			candidate.sheet_template_id === templateId &&
			candidate.store_role_id === membership.role_id
	);

	return mergePermissions(membership.permissions, (override?.permissions ?? null) as never);
}

export function filterTemplatesByPermission<T extends { id: string }>(
	templates: T[],
	membership: StoreMembershipLike | null | undefined,
	overrides: TemplateOverrideLike[] | null | undefined,
	permission: StoreRolePermissionKey
) {
	return templates.filter((template) =>
		hasPermission(getTemplatePermissions(template.id, membership, overrides), permission)
	);
}

export function filterSheetsByPermission<T extends { sheet_template_id: string }>(
	sheets: T[],
	membership: StoreMembershipLike | null | undefined,
	overrides: TemplateOverrideLike[] | null | undefined,
	permission: StoreRolePermissionKey
) {
	return sheets.filter((sheet) =>
		hasPermission(
			getTemplatePermissions(sheet.sheet_template_id, membership, overrides),
			permission
		)
	);
}

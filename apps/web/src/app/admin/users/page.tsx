'use client';

import { ROLES, createStaffSchema, type AdminUserDto, type Role } from '@sewa/shared';
import { useState, type FormEvent } from 'react';
import { ApiError } from '@/api/client';
import type { UserListParams } from '@/api/admin.api';
import { Alert, Badge, Button, Modal, PageTitle, QueryState, SelectField, SkeletonTable, STICKY_HEAD, TableCard, TextField } from '@/components/common';
import { useCreateStaff, useSetUserActive, useUsers } from '@/hooks/useAdmin';
import { useDistricts, useLocalLevels, useProvinces, useWards } from '@/hooks/useReference';
import { formatDate, formatNumber } from '@/lib/format';
import { pickName, useI18n } from '@/lib/i18n';

/**
 * User management (PRD F14), system admin only. The API enforces that on every call; this page is just
 * the screen for it.
 *   - list: role filter + search (name or email), 20 per page
 *   - "Add staff account": a ward officer (palika → ward) or a palika admin (palika)
 *   - deactivate / activate: accounts are never deleted (requests and history point at them)
 */
export default function AdminUsersPage() {
  const { t, lang } = useI18n();
  const [filters, setFilters] = useState<UserListParams>({ page: 1 });
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [toggling, setToggling] = useState<AdminUserDto | null>(null);
  const [notice, setNotice] = useState<string>();
  const users = useUsers(filters);
  const setActive = useSetUserActive();

  const page = filters.page ?? 1;
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.pageSize)) : 1;

  function onSearch(e: FormEvent) {
    e.preventDefault(); // search runs on submit (Enter or button), not on every key press
    setFilters((f) => ({ ...f, q: search.trim() || undefined, page: 1 }));
  }

  function confirmToggle() {
    if (!toggling) return;
    setActive.mutate(
      { id: toggling.id, isActive: !toggling.isActive },
      {
        onSuccess: (u) => setNotice(t(u.isActive ? 'admin.activated' : 'admin.deactivated').replace('{name}', u.name)),
        onSettled: () => setToggling(null),
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <PageTitle title={t('admin.usersTitle')} intro={t('admin.usersIntro')} />
        <Button size="lg" onClick={() => setCreating(true)}>
          {t('admin.addStaff')}
        </Button>
      </div>

      {notice && <Alert tone="success">{notice}</Alert>}
      {setActive.error && <Alert tone="error">{setActive.error instanceof ApiError ? setActive.error.message : t('common.error')}</Alert>}

      <form role="search" aria-label={t('admin.filters')} className="grid items-end gap-4 sm:grid-cols-[1fr_2fr_auto]" onSubmit={onSearch}>
        <SelectField
          label={t('admin.role')}
          value={filters.role ?? ''}
          onChange={(v) => setFilters((f) => ({ ...f, role: (v || undefined) as Role | undefined, page: 1 }))}
          options={[{ value: '', label: t('staff.all') }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]}
        />
        <TextField label={t('admin.search')} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('admin.searchPlaceholder')} />
        <Button type="submit" variant="secondary">
          {t('admin.searchButton')}
        </Button>
      </form>

      <QueryState isLoading={users.isLoading} error={users.error} onRetry={() => users.refetch()} skeleton={<SkeletonTable rows={8} cols={7} />} />

      {users.data && (
        <>
          <p aria-live="polite" className="text-sm text-muted">
            {formatNumber(users.data.total, lang)} {t('admin.accounts')}
          </p>
          <TableCard
            label={t('admin.usersTitle')}
            maxHeight="max-h-[36rem]"
            dimmed={users.isPlaceholderData}
            footer={
              <nav aria-label={t('staff.pagination')} className="flex flex-wrap items-center justify-between gap-3">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setFilters((f) => ({ ...f, page: page - 1 }))}>
                  ← {t('staff.prev')}
                </Button>
                <span className="text-sm">
                  {t('staff.page')} {formatNumber(page, lang)} / {formatNumber(totalPages, lang)}
                </span>
                <Button variant="secondary" disabled={page >= totalPages} onClick={() => setFilters((f) => ({ ...f, page: page + 1 }))}>
                  {t('staff.next')} →
                </Button>
              </nav>
            }
          >
            <table className="w-full min-w-[860px] text-left text-sm">
              <caption className="sr-only">{t('admin.usersTitle')}</caption>
              <thead className={STICKY_HEAD}>
                <tr>
                  <th scope="col" className="p-3">{t('register.name')}</th>
                  <th scope="col" className="p-3">{t('login.email')}</th>
                  <th scope="col" className="p-3">{t('admin.role')}</th>
                  <th scope="col" className="p-3">{t('admin.place')}</th>
                  <th scope="col" className="p-3">{t('admin.status')}</th>
                  <th scope="col" className="p-3">{t('admin.created')}</th>
                  <th scope="col" className="p-3">
                    <span className="sr-only">{t('staff.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id} className="border-t border-line">
                    <td className="p-3 font-medium">{u.name}</td>
                    <td className="p-3 font-mono">{u.email}</td>
                    <td className="p-3">{t(`role.${u.role}`)}</td>
                    <td className="p-3">
                      {u.palikaNameEn ?? '—'}
                      {u.wardNumber !== null && `, ${t('apply.wardN')} ${formatNumber(u.wardNumber, lang)}`}
                    </td>
                    <td className="p-3">
                      <Badge tone={u.isActive ? 'success' : 'neutral'}>{t(u.isActive ? 'admin.active' : 'admin.inactive')}</Badge>
                    </td>
                    <td className="p-3">{formatDate(u.createdAt, lang)}</td>
                    <td className="p-3">
                      {/* System admins can't be deactivated (the API refuses too): no button. */}
                      {u.role !== 'SYSTEM_ADMIN' && (
                        <Button variant={u.isActive ? 'danger' : 'secondary'} onClick={() => setToggling(u)}>
                          {t(u.isActive ? 'admin.deactivate' : 'admin.activate')}
                          <span className="sr-only"> {u.name}</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        </>
      )}

      <Modal
        open={toggling !== null}
        onClose={() => setToggling(null)}
        title={t(toggling?.isActive ? 'admin.deactivateTitle' : 'admin.activateTitle')}
        description={t(toggling?.isActive ? 'admin.deactivateBody' : 'admin.activateBody')}
        closeLabel={t('common.close')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setToggling(null)}>
              {t('staff.back')}
            </Button>
            <Button variant={toggling?.isActive ? 'danger' : 'primary'} loading={setActive.isPending} onClick={confirmToggle}>
              {t(toggling?.isActive ? 'admin.deactivate' : 'admin.activate')}
            </Button>
          </>
        }
      >
        <p>
          <strong>{toggling?.name}</strong> <span className="font-mono text-muted">{toggling?.email}</span>
        </p>
      </Modal>

      {creating && (
        <CreateStaffModal
          onClose={() => setCreating(false)}
          onCreated={(name) => {
            setCreating(false);
            setNotice(t('admin.created_ok').replace('{name}', name));
          }}
        />
      )}
    </div>
  );
}

type StaffRole = 'WARD_OFFICER' | 'PALIKA_ADMIN';
type Field = 'name' | 'email' | 'password' | 'place';
const toNumber = (v: string) => (v ? Number(v) : undefined);

/**
 * The "Add staff account" form, in a modal. Same cascading dropdowns as the Apply form
 * (province → district → palika → ward); the ward step appears only for a ward officer.
 * Validated with the shared createStaffSchema before sending; the API validates again.
 */
function CreateStaffModal({ onClose, onCreated }: { onClose: () => void; onCreated: (name: string) => void }) {
  const { t, lang } = useI18n();
  const create = useCreateStaff();
  const [role, setRole] = useState<StaffRole>('WARD_OFFICER');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [provinceId, setProvinceId] = useState<number>();
  const [districtId, setDistrictId] = useState<number>();
  const [localLevelId, setLocalLevelId] = useState<number>();
  const [wardId, setWardId] = useState<number>();
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});

  const provinces = useProvinces();
  const districts = useDistricts(provinceId);
  const localLevels = useLocalLevels(districtId);
  const wards = useWards(role === 'WARD_OFFICER' ? localLevelId : undefined);

  // Choosing a higher level clears everything below it (a ward from another palika must not stay selected).
  function chooseProvince(value: string) {
    setProvinceId(toNumber(value));
    setDistrictId(undefined);
    setLocalLevelId(undefined);
    setWardId(undefined);
  }
  function chooseDistrict(value: string) {
    setDistrictId(toNumber(value));
    setLocalLevelId(undefined);
    setWardId(undefined);
  }
  function choosePalika(value: string) {
    setLocalLevelId(toNumber(value));
    setWardId(undefined);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const body = role === 'WARD_OFFICER' ? { role, ...form, wardId } : { role, ...form, localLevelId };
    const parsed = createStaffSchema.safeParse(body);
    if (!parsed.success) {
      const next: Partial<Record<Field, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key === 'wardId' || key === 'localLevelId') next.place ??= t(role === 'WARD_OFFICER' ? 'admin.err.ward' : 'admin.err.palika');
        else if (key === 'name' || key === 'email' || key === 'password') next[key] ??= t(`register.err.${key}`);
      }
      setErrors(next);
      return;
    }
    setErrors({});
    create.mutate(parsed.data, {
      onSuccess: (u) => onCreated(u.name),
      onError: (err) => {
        if (err instanceof ApiError && err.code === 'CONFLICT') setErrors({ email: t('register.err.taken') });
      },
    });
  }

  const apiError = create.error instanceof ApiError && create.error.code !== 'CONFLICT' ? create.error.message : create.error && !(create.error instanceof ApiError) ? t('common.error') : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('admin.addStaff')}
      description={t('admin.addStaffBody')}
      closeLabel={t('common.close')}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('staff.back')}
          </Button>
          {/* `form=` connects this button (outside the <form>, in the modal footer) to the form. */}
          <Button type="submit" form="create-staff" loading={create.isPending}>
            {t('admin.createButton')}
          </Button>
        </>
      }
    >
      <form id="create-staff" onSubmit={submit} className="flex flex-col gap-4" noValidate>
        {apiError && <Alert tone="error">{apiError}</Alert>}
        <fieldset className="flex flex-wrap gap-4">
          <legend className="mb-2 text-sm font-semibold">{t('admin.role')}</legend>
          {(['WARD_OFFICER', 'PALIKA_ADMIN'] as const).map((r) => (
            <label key={r} className="flex min-h-11 items-center gap-2">
              <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="h-5 w-5" />
              {t(`role.${r}`)}
            </label>
          ))}
        </fieldset>
        <TextField label={t('register.name')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} error={errors.name} required />
        <TextField label={t('login.email')} type="email" placeholder="officer.name@example.com" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} required />
        <TextField
          label={t('admin.tempPassword')}
          hint={t('register.passwordHint')}
          type="text"
          autoComplete="off"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          error={errors.password}
          required
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('apply.province')}
            value={String(provinceId ?? '')}
            onChange={chooseProvince}
            placeholder={t('apply.choose')}
            options={(provinces.data ?? []).map((p) => ({ value: String(p.id), label: pickName(p, lang) }))}
          />
          <SelectField
            label={t('apply.district')}
            value={String(districtId ?? '')}
            disabled={provinceId === undefined}
            onChange={chooseDistrict}
            placeholder={t('apply.choose')}
            options={(districts.data ?? []).map((d) => ({ value: String(d.id), label: pickName(d, lang) }))}
          />
          <SelectField
            label={t('apply.palika')}
            value={String(localLevelId ?? '')}
            disabled={districtId === undefined}
            error={role === 'PALIKA_ADMIN' ? errors.place : undefined}
            onChange={choosePalika}
            placeholder={t('apply.choose')}
            options={(localLevels.data ?? []).map((l) => ({ value: String(l.id), label: pickName(l, lang) }))}
          />
          {role === 'WARD_OFFICER' && (
            <SelectField
              label={t('apply.ward')}
              value={String(wardId ?? '')}
              disabled={localLevelId === undefined}
              error={errors.place}
              onChange={(v) => setWardId(toNumber(v))}
              placeholder={t('apply.choose')}
              options={(wards.data ?? []).map((w) => ({ value: String(w.id), label: `${t('apply.wardN')} ${formatNumber(w.number, lang)}` }))}
            />
          )}
        </div>
      </form>
    </Modal>
  );
}

const roles = ['owner', 'accountant', 'staff', 'viewer'];
const pages = ['dashboard','sales','inventory','customers','suppliers','purchases','expenses','cashbook','reports','tax','employees','team','activity','settings','backups'];
export function canViewPage(role: string | undefined, page: string): boolean {
  if (!role || !roles.includes(role) || !pages.includes(page)) return false;
  if (['team','backups'].includes(page)) return role === 'owner';
  return role !== 'staff' || ['sales','inventory','customers','suppliers','settings'].includes(page);
}
export function canEditResource(role: string | undefined, resource: string): boolean {
  if (!role || !roles.includes(role) || role === 'viewer') return false;
  if (['members','tax_rules','backups','business'].includes(resource)) return role === 'owner';
  if (role === 'staff') return ['contacts','transactions'].includes(resource);
  return ['contacts','products','employees','transactions','reminders'].includes(resource);
}
export function canPostTransaction(role: string | undefined, kind: string): boolean {
  return canEditResource(role, 'transactions') && ['sale','receipt','purchase','expense','payroll','capital','transfer','payment'].includes(kind) && (role !== 'staff' || ['sale','receipt'].includes(kind));
}

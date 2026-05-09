-- Allow platform staff to audit tenant-view launches as Secretary / Office Admin.

alter type public.app_role add value if not exists 'secretary';

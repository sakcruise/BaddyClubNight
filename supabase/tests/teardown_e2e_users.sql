-- Removes everything seed_e2e_users.sql created. Run in the Supabase SQL Editor.
DELETE FROM public.groups WHERE id = 'e2e00000-0000-4000-8000-0000000000a0';
DELETE FROM public.accounts WHERE id::text LIKE 'e2e00000-%';
DELETE FROM public.profiles WHERE user_id::text LIKE 'e2e00000-%';
DELETE FROM auth.users WHERE id::text LIKE 'e2e00000-%';

-- Removes everything seed_e2e_users.sql created. Run in the Supabase SQL Editor.
DELETE FROM public.members WHERE club_id::text LIKE 'e2e00000-%';
DELETE FROM public.groups WHERE id::text LIKE 'e2e00000-%';
DELETE FROM public.accounts WHERE id::text LIKE 'e2e00000-%';
DELETE FROM public.profiles WHERE user_id::text LIKE 'e2e00000-%';
DELETE FROM auth.users WHERE id::text LIKE 'e2e00000-%';

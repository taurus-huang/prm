-- 角色權限:只有管理員(admin)能新增 / 修改 / 刪除專案、里程碑、成員與專案成員配置(allocations);其他登入帳號(viewer 等)只能讀取。
-- 在 Supabase SQL Editor 執行一次。前端只是隱藏按鈕,真正擋住寫入的是這裡的 RLS。

-- 1. 把舊的「所有登入者可讀寫」policy 拿掉(名稱依 prm.sql)
drop policy if exists "Allow authenticated users access projects" on projects;
drop policy if exists "Allow authenticated users access milestones" on milestones;
drop policy if exists "Allow authenticated users access members" on members;
drop policy if exists "Allow authenticated users access allocations" on allocations;

-- 2. 所有登入者都能讀取
create policy "Authenticated read projects" on projects for select to authenticated using (true);
create policy "Authenticated read milestones" on milestones for select to authenticated using (true);
create policy "Authenticated read members" on members for select to authenticated using (true);
create policy "Authenticated read allocations" on allocations for select to authenticated using (true);

-- 3. 只有 app_metadata.role = 'admin' 的帳號能寫入
create policy "Admin write projects" on projects for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
create policy "Admin write milestones" on milestones for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin write members" on members for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

create policy "Admin write allocations" on allocations for all to authenticated
  using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 4. 設定管理員(把 email 換成實際帳號;設定後該帳號需要重新登入才會生效)。
--    資料庫判斷的是 raw_app_meta_data(app_metadata)的 role,不是 raw_user_meta_data(user_metadata):
--    user_metadata 登入的使用者自己就能改(supabase.auth.updateUser),若拿它當權限依據,任何人都能把自己改成 admin。
--    網頁畫面會先讀 app_metadata.role,沒有才讀 user_metadata.role,都沒有就顯示 viewer。
--    如果你已經在 raw_user_meta_data 設了 {"role": "admin"},執行下面這段把它複製到 raw_app_meta_data:
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', raw_user_meta_data ->> 'role')
--   where raw_user_meta_data ? 'role';
--    或只設定單一帳號:
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role": "admin"}'::jsonb
--   where email = 'admin@example.com';

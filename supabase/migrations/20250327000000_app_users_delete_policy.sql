-- Allow delete on app_users (for remove user flow)
DROP POLICY IF EXISTS "app_users_delete" ON "app_users";
CREATE POLICY "app_users_delete" ON "app_users" FOR DELETE USING (true);

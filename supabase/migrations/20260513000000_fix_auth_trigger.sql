-- =====================================================
-- AUTH TRIGGER FIX
-- =====================================================
-- "Database error saving new user" hatasını düzeltir.
-- - search_path explicit set edilir
-- - EXCEPTION handling eklenir (trigger hata verse bile user oluşur)
-- - RLS bypass garantilenir
-- =====================================================

CREATE OR REPLACE FUNCTION public.assign_pool_keys_to_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Hata olursa user kaydını engelleme, sadece logla
  BEGIN
    INSERT INTO public.user_pool_assignments (user_id, vapi_account_id)
    SELECT NEW.id, va.id
    FROM public.vapi_accounts va
    WHERE va.is_active = true
      AND va.status IN ('active', 'standby')
      AND NOT EXISTS (
        SELECT 1 FROM public.user_pool_assignments upa
        WHERE upa.vapi_account_id = va.id
          AND upa.is_active = true
      )
    ORDER BY va.priority ASC NULLS LAST, va.created_at ASC
    LIMIT 10;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'assign_pool_keys_to_new_user failed for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

-- Trigger zaten var, sadece fonksiyon güncellendi.

-- Function permission garantile
GRANT EXECUTE ON FUNCTION public.assign_pool_keys_to_new_user() TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.assign_pool_keys_to_new_user() TO postgres;
GRANT EXECUTE ON FUNCTION public.assign_pool_keys_to_new_user() TO service_role;

-- AIDEV-NOTE: disposable infrastructure fixture policy, not product tenant authorization.
CREATE POLICY ops402_owner ON storage.objects FOR ALL TO authenticated
USING (bucket_id LIKE 'ops402-%' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id LIKE 'ops402-%' AND (storage.foldername(name))[1] = auth.uid()::text);

-- GST course uses the designed "Certificate of Completion" artwork
-- (src/assets/certificates/gst-compliance.jpg), signed by CA Gaurav K Patiyat.
-- Align the course's certificate kind and the signatory setting with it.
update academy_courses set certificate_kind = 'completion' where slug = 'gst-compliance';
update academy_settings set value = 'CA Gaurav K Patiyat', updated_at = now()
 where key = 'signatory_name' and (value is null or value like 'TODO%');

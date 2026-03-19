-- Create storage buckets for document management
-- This migration sets up Supabase Storage buckets and RLS policies

-- Create the main documents bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'documents',
  'documents',
  false,
  52428800, -- 50MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/tiff',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'application/rtf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Create the document-templates bucket (for template files)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'document-templates',
  'document-templates',
  false,
  10485760, -- 10MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/html'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for documents bucket
-- Authenticated users can upload documents
CREATE POLICY "Authenticated users can upload documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'documents');

-- Authenticated users can read documents
CREATE POLICY "Authenticated users can read documents"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'documents');

-- Authenticated users can update their own uploads
CREATE POLICY "Authenticated users can update documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'documents');

-- Authenticated users can delete documents
CREATE POLICY "Authenticated users can delete documents"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'documents');

-- RLS Policies for document-templates bucket
CREATE POLICY "Authenticated users can read templates"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'document-templates');

CREATE POLICY "Authenticated users can upload templates"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'document-templates');

CREATE POLICY "Authenticated users can update templates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'document-templates');

CREATE POLICY "Authenticated users can delete templates"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'document-templates');

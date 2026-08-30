-- Document Studio V3 — enum extensions (own transaction).
-- PostgreSQL cannot use newly added enum values in the same transaction;
-- tables, triggers and checks that reference these labels live in
-- 20260830170100_document_studio.sql.

alter type public.document_kind add value if not exists 'parecer';
alter type public.document_kind add value if not exists 'autorizacao';
alter type public.document_kind add value if not exists 'requerimento';
alter type public.document_kind add value if not exists 'protocolo';

alter type public.document_status add value if not exists 'under_review';
alter type public.document_status add value if not exists 'reviewed';
alter type public.document_status add value if not exists 'signature_pending';
alter type public.document_status add value if not exists 'externally_signed';
alter type public.document_status add value if not exists 'delivered';

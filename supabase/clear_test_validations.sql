-- Nettoyage des validations de test ChantierProof.
-- A executer dans Supabase SQL Editor uniquement si tu veux vider toute la liste.
--
-- Important :
-- Supabase interdit la suppression directe dans storage.objects depuis SQL.
-- Ce script vide donc la liste des validations.
-- Les fichiers du bucket validation-assets doivent etre supprimes depuis Storage
-- ou via l'API Storage si tu veux aussi nettoyer les photos/signatures/PDF.

begin;

delete from public.validations;

commit;

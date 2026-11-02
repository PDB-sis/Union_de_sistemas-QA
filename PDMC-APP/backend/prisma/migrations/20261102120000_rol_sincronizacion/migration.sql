-- Cuenta de sincronización por región: las cargas automáticas de las bodegas de cada
-- región se hacen a nombre de su propia cuenta (sin contraseña), no de una cuenta global.
-- Va sola en su migración: PostgreSQL no permite usar un valor de enum en la misma
-- transacción en que se crea.
ALTER TYPE "RolUsuario" ADD VALUE IF NOT EXISTS 'SINCRONIZACION';

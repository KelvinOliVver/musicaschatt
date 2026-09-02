-- Garante que uma mesma música (track_id) não possa ser duplicada na fila 
-- enquanto estiver com o status 'queued', evitando race conditions entre múltiplos clientes.
CREATE UNIQUE INDEX player_queue_unique_queued_track_idx 
ON public.player_queue (track_id) 
WHERE (status = 'queued');

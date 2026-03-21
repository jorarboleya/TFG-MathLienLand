-- ============================================================
-- 03_queries.sql
-- Consultas útiles para calcular el rendimiento del usuario.
-- Estas consultas son las que alimentarán a la IA más adelante.
-- ============================================================

-- Porcentaje de aciertos por minijuego para un usuario concreto
select
  s.minigame,
  count(*)                                        as total_preguntas,
  sum(case when a.correct then 1 else 0 end)      as correctas,
  round(
    100.0 * sum(case when a.correct then 1 else 0 end) / count(*), 1
  )                                               as porcentaje_aciertos
from answers a
join sessions s on s.id = a.session_id
where s.user_id = '<uuid_del_usuario>'
group by s.minigame
order by s.minigame;


-- Tiempo medio de respuesta por minijuego
select
  s.minigame,
  round(avg(a.time), 1) as tiempo_medio_segundos
from answers a
join sessions s on s.id = a.session_id
where s.user_id = '<uuid_del_usuario>'
group by s.minigame
order by s.minigame;


-- Rendimiento por nivel de dificultad (útil para la IA)
select
  s.minigame,
  a.difficulty,
  count(*)                                        as total,
  sum(case when a.correct then 1 else 0 end)      as correctas,
  round(
    100.0 * sum(case when a.correct then 1 else 0 end) / count(*), 1
  )                                               as porcentaje_aciertos
from answers a
join sessions s on s.id = a.session_id
where s.user_id = '<uuid_del_usuario>'
group by s.minigame, a.difficulty
order by s.minigame, a.difficulty;


-- Historial de sesiones de un usuario
select
  s.minigame,
  s.date,
  s.duration,
  count(a.id)                                     as preguntas_respondidas,
  sum(case when a.correct then 1 else 0 end)      as correctas
from sessions s
left join answers a on a.session_id = s.id
where s.user_id = '<uuid_del_usuario>'
group by s.id
order by s.date desc;

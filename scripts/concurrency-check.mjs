// Comprobación de concurrencia opcional contra una base de datos real.
//
// Solo hace algo si existe DATABASE_URL (cadena de conexión Postgres de
// Supabase, con permisos para ejecutar las RPC). Si no está, termina con
// éxito explicando que se omite: así no rompe CI ni el flujo normal.
//
// Verifica el candado por sala de join_room: aunque se lancen 30 peticiones
// a la vez, nunca entran más de 8 equipos a la misma sala.

import { Client } from 'pg'

const CONNECTIONS = 30
const MAX_TEAMS = 8

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  console.log('concurrency-check: DATABASE_URL no definida, se omite la comprobación.')
  process.exit(0)
}

async function rpc(client, name, params) {
  const keys = Object.keys(params)
  const placeholders = keys.map((key, index) => `${key} => $${index + 1}`).join(', ')
  const sql = `select public.${name}(${placeholders}) as result`
  const { rows } = await client.query(sql, keys.map((key) => params[key]))
  return rows[0]?.result
}

async function main() {
  const admin = new Client({ connectionString })
  await admin.connect()

  try {
    const created = await rpc(admin, 'create_room', { p_team_name: 'Anfitrión' })
    const room = typeof created === 'string' ? JSON.parse(created) : created
    const roomId = room.room_id
    console.log(`concurrency-check: sala ${room.code} (${roomId}) creada.`)

    const attempts = await Promise.all(
      Array.from({ length: CONNECTIONS }, async (_, index) => {
        const client = new Client({ connectionString })
        await client.connect()
        try {
          const result = await rpc(client, 'join_room', {
            p_code: room.code,
            p_team_name: `Equipo ${index + 1}`,
          })
          return { ok: true, result }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return { ok: false, message }
        } finally {
          await client.end()
        }
      }),
    )

    const joined = attempts.filter((attempt) => attempt.ok).length
    const full = attempts.filter(
      (attempt) => !attempt.ok && String(attempt.message).includes('sala_llena'),
    ).length

    const total = joined + 1
    console.log(`concurrency-check: equipos que entraron (sin anfitrión): ${joined}`)
    console.log(`concurrency-check: rechazados por sala llena: ${full}`)
    console.log(`concurrency-check: total en la sala: ${total}/${MAX_TEAMS}`)

    if (total > MAX_TEAMS) {
      throw new Error(`¡Se superó el máximo! ${total} equipos en la sala.`)
    }
    if (joined !== MAX_TEAMS - 1) {
      throw new Error(`Se esperaban ${MAX_TEAMS - 1} uniones correctas, hubo ${joined}.`)
    }
    console.log('concurrency-check: OK, el candado por sala funciona.')
  } finally {
    await admin.end()
  }
}

main().catch((error) => {
  console.error('concurrency-check: FALLO', error)
  process.exit(1)
})

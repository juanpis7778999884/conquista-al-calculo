export type ParsedRpcError = {
  code: string
  param?: number
  message: string
}

const MESSAGES: Record<string, string> = {
  sala_no_existe: 'No existe ninguna sala con ese código.',
  sala_no_lobby: 'La partida ya comenzó. No se puede entrar a esa sala.',
  sala_llena: 'La sala está llena (máximo 8 equipos).',
  nombre_repetido: 'Ya hay un equipo con ese nombre en la sala. Elige otro.',
  nombre_invalido: 'Escribe un nombre de equipo válido.',
  codigo_invalido: 'Escribe un código de sala válido.',
  no_anfitrion: 'Solo el anfitrión puede hacer esta acción.',
  estado_invalido: 'La partida no está en el estado esperado. Actualiza la página.',
  token_invalido: 'Tu sesión ya no es válida. Vuelve a entrar a la sala.',
  equipo_no_existe: 'Tu equipo ya no está en la sala.',
  zona_invalida: 'Esa zona no existe.',
  zona_conquistada: 'Esa zona ya está conquistada.',
  paso_invalido: 'El paso cambió. Se actualizará la pregunta.',
  enfriamiento: 'Espera un segundo antes de volver a intentarlo.',
  datos_invalidos: 'Faltan datos para enviar la respuesta.',
  sin_preguntas: 'El servidor no tiene preguntas configuradas.',
  codigo_agotado: 'No se pudo generar un código único. Inténtalo de nuevo.',
  network: 'No se pudo conectar con el servidor. Revisa tu conexión.',
  desconocido: 'Ha ocurrido un error inesperado. Inténtalo de nuevo.',
}

export function parseRpcError(error: unknown): ParsedRpcError {
  const raw =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message: unknown }).message)
      : typeof error === 'string'
        ? error
        : ''

  if (!raw) {
    return { code: 'desconocido', message: MESSAGES.desconocido }
  }

  const [code, paramRaw] = raw.split(':')
  const message = MESSAGES[code]
  if (message) {
    const param = paramRaw !== undefined ? Number(paramRaw) : undefined
    return { code, message, param: Number.isFinite(param) ? param : undefined }
  }

  return { code: 'desconocido', message: MESSAGES.desconocido }
}

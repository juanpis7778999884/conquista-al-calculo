# Pruebas manuales (dos navegadores)

Guion para probar Conquista Cálculo con dos perfiles/navegadores distintos (por ejemplo,
Chrome normal y Chrome de incógnito), de modo que cada uno tenga su propio `localStorage`.

Antes de empezar:

- `pnpm dev` en marcha.
- SQL ejecutado en Supabase en orden: migración → seed → verify.

## 1. Crear sala

1. Navegador A: escribe "Alfa" y pulsa **Crear sala**.
2. Debe aparecer el **lobby** con un código de 6 caracteres, "Alfa" como *Anfitrión* y "1/8".
3. Navegador A debe ver el botón **Iniciar partida**.

## 2. Unirse con el código

1. Navegador B: abre `/?sala=CODIGO` (o escribe el código y "Unirme a la sala").
2. El campo de código debe venir relleno con el enlace `?sala=`.
3. Navegador B entra al lobby y ve "Esperando al anfitrión…". A debe ver a "Beta" y "2/8" sin
   recargar (Realtime).

## 3. Errores de unión

- **Nombre repetido**: en B (o una tercera pestaña) intenta unirte con el mismo nombre "Alfa".
  Mensaje: "Ya hay un equipo con ese nombre…".
- **Sala llena**: añade equipos hasta 8 y prueba el noveno. Mensaje: "La sala está llena…".
- **Sala inexistente**: código `XXXXXX`. Mensaje: "No existe ninguna sala con ese código.".

## 4. Solo el anfitrión inicia

1. En B, confirma que **no** hay botón "Iniciar partida".
2. En A, pulsa **Iniciar partida**. Ambos navegadores deben pasar solos al juego.

## 5. Recargar a mitad de una zona

1. En B, abre una zona y responde correctamente 1 paso.
2. Recarga la página en B.
3. Debe reanudar en la misma zona y en el **mismo paso** (el paso viene del servidor), con el
   cronómetro continuando.

## 6. Cerrar y reabrir el modal

1. Abre una zona, cierra con la **×** y vuelve a abrirla.
2. Debe seguir en el mismo paso (no reinicia).

## 7. Error y penalización de 15 s

1. Responde mal un reto.
2. Debe aparecer "Respuesta incorrecta: +15 segundos…" y el cronómetro debe subir 15 s.
3. Las opciones se deshabilitan ~1 s (enfriamiento). Enviar dos veces seguidas muy rápido debe
   mostrar "Espera un segundo…".

## 8. Conquistar zona y ranking

1. Acierta los 3 retos de una zona.
2. La zona se marca como conquistada y en el ranking (en ambos navegadores) sube la cuenta
   `1/7 zonas`.

## 9. Terminar la partida

1. Como anfitrión (A), durante el juego pulsa **Terminar partida** y confirma.
2. Ambos navegadores deben ver el **podio**. Los equipos que no terminaron muestran "Sin
   terminar".

## 10. Final individual

1. Vuelve a crear una sala de prueba con una sola zona conquistable… o completa las 7 zonas con
   un equipo.
2. Al conquistar la 7.ª, ese equipo ve "¡Conquista completada!" con su tiempo efectivo y su
   posición.

## 11. Reconexión

1. Con la partida en curso, corta la red (Modo avión / DevTools → Offline) unos segundos.
2. Debe aparecer "Reconectando…". Al volver la red, el estado debe resincronizarse solo.

## 12. Reanudar sesión guardada

1. Recarga en cualquier estado (lobby, juego o final).
2. Debe reanudar automáticamente sin volver al home.

## 13. Salir de la sala

1. Pulsa **Salir de la sala**.
2. Debe volver al home y el `localStorage` quedar limpio. Al recargar ya no debe reanudar.

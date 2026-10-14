# Pruebas manuales (dos navegadores)

Guion para probar Conquista Cálculo con dos perfiles/navegadores distintos (por ejemplo,
Chrome normal y Chrome de incógnito), de modo que cada uno tenga su propio `localStorage`.

Antes de empezar:

- `pnpm dev` en marcha.
- SQL ejecutado en Supabase en orden: migración 1 → migración 2 (`ronda2`) → seed → verify.

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
2. Debe abrirse un diálogo de confirmación; al confirmar, vuelve al home y el `localStorage`
   queda limpio. Al recargar ya no debe reanudar. Cancelar no debe hacer nada.

## 14. Salir del lobby vs. abandonar en partida

1. En el **lobby**, con dos equipos, sal con Beta y confirma: Beta desaparece de la lista y el
   contador baja.
2. En **partida**, sal con Beta y confirma: Beta aparece marcado como **"Abandonó"** en el
   ranking de los demás (no desaparece) y deja de contar para el cierre de sala.
3. Si Beta era el anfitrión, el rol de anfitrión (botón "Terminar partida") pasa al equipo
   activo más antiguo.

## 15. Sin conexión con el servidor

1. Con la partida en curso, en DevTools → Network pon "Offline" y recarga.
2. Debe aparecer **"Sin conexión con el servidor"** con botón *Reintentar* (no se borra la
   sesión).
3. Vuelve a "Online" y espera ≤5 s (o pulsa *Reintentar*): debe reanudar la partida.

## 16. Código privado y anfitrión por token

1. En Supabase, `select code from rooms;` debe devolver un valor largo/opaco, no el código de
   6 caracteres. El código que sirve para unirse solo está en `room_codes`.
2. **Terminar partida** solo aparece/actúa para el anfitrión actual (aunque haya recargado).

## 17. Mapa en móvil

1. Abre la app en vista móvil (DevTools, ancho < 640 px).
2. El mapa debe verse como **tarjetas** legibles (nombre, tema y estado), tocables para abrir
   el reto. En pantallas grandes sigue el SVG con la ✓ sin tapar el nombre.

## 18. Desempate del ranking

1. Con dos equipos que conquistan el mismo número de zonas y sin terminar, gana quien haya
   conquistado su última zona antes.
2. Los equipos con 0 zonas quedan al final, ordenados por antigüedad.

## 19. Proyector

1. En el lobby (como anfitrión), pulsa **Abrir proyector** (`/proyector?sala=CODIGO`) en otra
   pestaña/pantalla.
2. Debe resolver el código y mostrar el ranking en vivo (equipos y zonas).
3. Al terminar la partida, debe mostrar la **tabla de resultado final** con zonas, errores y
   tiempo.

## 20. Jugar otra vez (anfitrión)

1. Con la partida terminada, en el proyector o en el móvil, el **anfitrión** ve **Jugar otra
   vez**; el resto ve "Esperando al anfitrión…".
2. Al pulsarlo, todos vuelven al **lobby**, el progreso y los intentos quedan a cero y los
   equipos que habían abandonado desaparecen.

## 21. Explicación tras acertar

1. Acierta un reto: debe aparecer un recuadro **"Por qué"** con la explicación del paso.
2. Al acertar el último reto de una zona, el modal muestra "¡Zona conquistada!" y la
   explicación antes de cerrar.

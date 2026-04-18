# PR Intra Front

Frontend de intranet corporativa construido con Next.js (App Router) que consume un backend Laravel API (Sanctum + broadcasting).

El proyecto incluye:

- Login con token Bearer.
- Dashboard interno con secciones por rol.
- Conversaciones en tiempo real (Laravel Echo + Reverb/Pusher).
- Gestion de documentos/publicaciones/usuarios/roles segun permisos.

## Stack Tecnologico

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- Laravel Echo + Pusher JS

## Requisitos

- Node.js 20+
- pnpm (recomendado)
- Backend Laravel disponible (por defecto en `http://localhost:8000`)

## Instalacion

```bash
pnpm install
```

## Variables de Entorno

Crea un archivo `.env.local` en la raiz del proyecto.

### Variables minimas

```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api
```

### Variables opcionales (Realtime / Echo)

```env
# Reverb (preferido)
NEXT_PUBLIC_REVERB_APP_KEY=
NEXT_PUBLIC_REVERB_HOST=127.0.0.1
NEXT_PUBLIC_REVERB_PORT=8080
NEXT_PUBLIC_REVERB_SCHEME=http

# Compatibilidad con Pusher
NEXT_PUBLIC_PUSHER_APP_KEY=
NEXT_PUBLIC_PUSHER_HOST=127.0.0.1
NEXT_PUBLIC_PUSHER_PORT=6001
NEXT_PUBLIC_PUSHER_SCHEME=http

# Echo
NEXT_PUBLIC_ECHO_NAMESPACE=App.Events
NEXT_PUBLIC_BROADCAST_AUTH_ENDPOINT=http://localhost:8000/broadcasting/auth
NEXT_PUBLIC_CHAT_CHANNEL_TEMPLATE=conversations.{conversationId}
```

## Ejecucion Local

```bash
pnpm dev
```

Aplicacion: `http://localhost:3000`

## Scripts Disponibles

- `pnpm dev`: inicia entorno de desarrollo.
- `pnpm build`: genera build de produccion.
- `pnpm start`: levanta build de produccion.
- `pnpm lint`: ejecuta ESLint.

## Estructura Funcional

- `/`:
	login contra `POST /login`, validacion de sesion con `GET /me`.
- `/dashboard`:
	vista principal con resumen de conversaciones y publicaciones.
- `/dashboard/conversations`:
	chat y adjuntos, con sincronizacion en tiempo real.
- `/dashboard/documents`:
	gestion/consulta de documentos.
- `/dashboard/publications`:
	publicaciones internas (visible segun permisos).
- `/dashboard/roles`:
	administracion de roles (admin).
- `/dashboard/users`:
	administracion de usuarios (admin).

## Autenticacion y Sesion

- El token se almacena en:
	- `localStorage` si el usuario marca "Mantener sesion iniciada".
	- `sessionStorage` si no lo marca.
- Las llamadas API autenticadas agregan header `Authorization: Bearer <token>`.
- Si una llamada retorna `401`, se limpia sesion local y se solicita login nuevamente.

## Integracion con Backend

- Base URL consumida por el frontend: `NEXT_PUBLIC_API_URL`.
- En desarrollo se soporta `rewrite` desde `/backend/*` al origen del backend definido en `next.config.ts`.
- Las imagenes remotas de storage local se permiten para:
	- `http://localhost/storage/**`
	- `http://127.0.0.1/storage/**`

Para detalle de endpoints y payloads, consulta: `API_NEXTJS.md`.

## Notas de Desarrollo

- El proyecto usa App Router (`app/`) y componentes cliente para vistas interactivas.
- Todas las peticiones del frontend pasan por `lib/api-client.ts` para estandarizar headers y manejo de errores.
- El realtime de conversaciones se inicializa desde `lib/echo-client.ts`.

## Troubleshooting Rapido

- Error de conexion con backend:
	revisa `NEXT_PUBLIC_API_URL`, CORS y que Laravel este levantado.
- No llegan eventos realtime:
	valida `NEXT_PUBLIC_REVERB_*` / `NEXT_PUBLIC_PUSHER_*` y credenciales.
- Login exitoso pero sin acceso:
	verifica permisos/roles retornados por `GET /me`.

## Referencias

- Documentacion Next.js: https://nextjs.org/docs
- API del proyecto: `API_NEXTJS.md`

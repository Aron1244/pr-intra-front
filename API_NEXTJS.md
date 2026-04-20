# Documentacion de API para Frontend Next.js

Esta guia resume las APIs disponibles en este backend Laravel para consumirlas desde Next.js.

## 1) Base URL

- Base local sugerida: `http://localhost:8000/api`
- Todas las rutas listadas aqui asumen el prefijo `/api`.

Ejemplo:

- Login: `POST http://localhost:8000/api/login`

## 2) Autenticacion (Sanctum token)

Este proyecto usa tokens Bearer con Sanctum.

### Login

- Metodo: `POST /login`
- Auth requerida: No
- Body (JSON):

```json
{
  "email": "admin@example.com",
  "password": "secret123",
  "device_name": "nextjs-client"
}
```

Validaciones:

- `email`: requerido, email valido
- `password`: requerido, string
- `device_name`: opcional, string, max 255

Respuesta 200:

```json
{
  "message": "Login successful.",
  "token_type": "Bearer",
  "access_token": "1|token...",
  "user": {
    "id": 1,
    "name": "Admin",
    "email": "admin@example.com",
    "roles": [
      {
        "id": 1,
        "name": "admin"
      }
    ]
  }
}
```

Error 422 (credenciales invalidas):

```json
{
  "message": "Invalid credentials."
}
```

### Obtener usuario autenticado

- Metodo: `GET /me`
- Auth requerida: Si
- Header: `Authorization: Bearer {access_token}`

Respuesta 200:

```json
{
  "data": {
    "id": 1,
    "name": "Admin",
    "email": "admin@example.com",
    "roles": [
      {
        "id": 1,
        "name": "admin"
      }
    ]
  }
}
```

### Logout

- Metodo: `POST /logout`
- Auth requerida: Si

Respuesta 200:

```json
{
  "message": "Logout successful."
}
```

## 3) Convencion de headers para Next.js

Para endpoints protegidos:

```http
Authorization: Bearer {access_token}
Accept: application/json
Content-Type: application/json
```

## 4) Endpoints de Usuarios

Rutas protegidas con Sanctum.

### Listar usuarios

- Metodo: `GET /users`
- Respuesta 200: coleccion tipo resource (`data: []`) de usuarios.

### Crear usuario

- Metodo: `POST /users`
- Body:

```json
{
  "name": "Juan Perez",
  "email": "juan@example.com",
  "password": "secret123",
  "password_confirmation": "secret123"
}
```

Validaciones:

- `name`: requerido, string, max 255
- `email`: requerido, email, unico
- `password`: requerido, string, min 8, confirmado

Respuesta 200 (resource):

```json
{
  "data": {
    "id": 10,
    "name": "Juan Perez",
    "email": "juan@example.com",
    "email_verified_at": null,
    "created_at": "2026-04-18T12:00:00.000000Z",
    "updated_at": "2026-04-18T12:00:00.000000Z"
  }
}
```

### Ver usuario

- Metodo: `GET /users/{id}`
- Respuesta 200: resource de usuario.

### Actualizar usuario

- Metodo: `PUT/PATCH /users/{id}`
- Body (campos opcionales):

```json
{
  "name": "Juan Actualizado",
  "email": "juan2@example.com",
  "password": "newsecret123",
  "password_confirmation": "newsecret123"
}
```

Validaciones:

- `name`: opcional, pero si se envia debe ser valido
- `email`: opcional, unico ignorando el usuario actual
- `password`: opcional, nullable, min 8, confirmado

### Eliminar usuario

- Metodo: `DELETE /users/{id}`
- Respuesta: `204 No Content`

## 5) Endpoints de Roles

Rutas protegidas con Sanctum.

**Importante:** Los roles ahora están asociados a departamentos. No se pueden crear roles sin un departamento.

- `GET /roles` - Listar todos los roles (ordenados por departamento)
- `POST /roles` - Crear rol en un departamento
- `GET /roles/{id}` - Ver rol específico
- `PUT/PATCH /roles/{id}` - Actualizar rol
- `DELETE /roles/{id}` - Eliminar rol
- `GET /departments/{department}/roles` - Listar roles de un departamento específico

### Listar todos los roles

- Metodo: `GET /roles`
- Respuesta 200:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Gerente",
      "department_id": 1,
      "can_post_announcements": true,
      "created_at": "2026-04-20T12:00:00.000000Z",
      "updated_at": "2026-04-20T12:00:00.000000Z"
    }
  ]
}
```

### Crear rol

- Metodo: `POST /roles`
- Body (requerido):

```json
{
  "name": "Gerente",
  "department_id": 1,
  "can_post_announcements": true
}
```

Validaciones:

- `name`: requerido, string, max 255, unico por departamento
- `department_id`: requerido, debe existir en `departments.id`
- `can_post_announcements`: opcional, boolean, default false

Respuesta 201:

```json
{
  "data": {
    "id": 1,
    "name": "Gerente",
    "department_id": 1,
    "can_post_announcements": true,
    "created_at": "2026-04-20T12:00:00.000000Z",
    "updated_at": "2026-04-20T12:00:00.000000Z"
  }
}
```

### Listar roles por departamento

- Metodo: `GET /departments/{department}/roles`
- Respuesta 200: coleccion de roles del departamento.

### Actualizar rol

- Metodo: `PUT/PATCH /roles/{id}`
- Body (campos opcionales):

```json
{
  "name": "Jefe de Área",
  "can_post_announcements": false
}
```

Validaciones:

- `name`: opcional, único ignorando el rol actual, max 255
- `can_post_announcements`: opcional, boolean
- `department_id`: NO se puede actualizar

### Eliminar rol

- Metodo: `DELETE /roles/{id}`
- Respuesta: `204 No Content`

## 6) Endpoints de Departamentos

Rutas protegidas con Sanctum.

**Importante:** Los departamentos pueden tener múltiples roles asociados. Al eliminar un departamento, también se eliminan todos sus roles.

### Listar departamentos

- Metodo: `GET /departments`
- Respuesta 200:

```json
{
  "data": [
    {
      "id": 1,
      "name": "Recursos Humanos",
      "description": "Departamento de RH",
      "created_at": "2026-04-20T12:00:00.000000Z",
      "updated_at": "2026-04-20T12:00:00.000000Z"
    }
  ]
}
```

### Crear departamento

- Metodo: `POST /departments`
- Body:

```json
{
  "name": "Recursos Humanos",
  "description": "Descripcion opcional del departamento"
}
```

Validaciones:

- `name`: requerido, string, max 255, unico
- `description`: opcional, string

Respuesta 201:

```json
{
  "message": "Departamento creado exitosamente.",
  "data": {
    "id": 1,
    "name": "Recursos Humanos",
    "description": "Descripcion opcional del departamento",
    "created_at": "2026-04-20T12:00:00.000000Z",
    "updated_at": "2026-04-20T12:00:00.000000Z"
  }
}
```

### Ver departamento

- Metodo: `GET /departments/{id}`

Respuesta 200: resource de departamento.

### Actualizar departamento

- Metodo: `PUT/PATCH /departments/{id}`
- Body (campos opcionales):

```json
{
  "name": "Recursos Humanos Actualizado",
  "description": "Nueva descripcion"
}
```

Validaciones:

- `name`: opcional, pero si se envia debe ser valido, unico ignorando el departamento actual
- `description`: opcional, string

### Eliminar departamento

- Metodo: `DELETE /departments/{id}`
- Respuesta: `204 No Content`

## 7) Roles por Usuario

Rutas protegidas con Sanctum.

### Listar roles de un usuario

- Metodo: `GET /users/{user}/roles`

Respuesta 200:

```json
{
  "data": {
    "user_id": 1,
    "roles": [
      {
        "id": 1,
        "name": "admin"
      }
    ]
  }
}
```

### Sincronizar roles de un usuario

- Metodo: `PUT /users/{user}/roles`
- Body:

```json
{
  "role_ids": [1, 2]
}
```

Validaciones:

- `role_ids`: requerido, array
- `role_ids.*`: integer, distinct, debe existir en `roles.id`

Respuesta 200:

```json
{
  "message": "User roles updated successfully.",
  "data": {
    "user_id": 1,
    "roles": [
      {
        "id": 1,
        "name": "admin"
      },
      {
        "id": 2,
        "name": "editor"
      }
    ]
  }
}
```

## 8) Endpoints de Documentos

Rutas protegidas con Sanctum.

### Listar documentos

- Metodo: `GET /documents`
- Respuesta 200:

```json
{
  "data": [
    {
      "id": 1,
      "title": "Documento A",
      "file_path": "/docs/a.pdf",
      "user_id": 1,
      "visibility": "public",
      "created_at": "2026-04-18T12:00:00.000000Z",
      "updated_at": "2026-04-18T12:00:00.000000Z"
    }
  ]
}
```

### Crear documento

- Metodo: `POST /documents`
- Body:

```json
{
  "title": "Manual interno",
  "file_path": "/storage/manual.pdf",
  "user_id": 1,
  "visibility": "department"
}
```

Validaciones:

- `title`: requerido, string, max 255
- `file_path`: requerido, string, max 2048
- `user_id`: requerido, integer, existe en users
- `visibility`: requerido, uno de `public | department | private`

Respuesta 201:

```json
{
  "data": {
    "id": 2,
    "title": "Manual interno",
    "file_path": "/storage/manual.pdf",
    "user_id": 1,
    "visibility": "department",
    "created_at": "2026-04-18T12:00:00.000000Z",
    "updated_at": "2026-04-18T12:00:00.000000Z"
  }
}
```

### Ver documento

- Metodo: `GET /documents/{id}`

### Actualizar documento

- Metodo: `PUT/PATCH /documents/{id}`
- Body: cualquier subconjunto de `title`, `file_path`, `user_id`, `visibility`.

### Eliminar documento

- Metodo: `DELETE /documents/{id}`
- Respuesta: `204 No Content`

## 9) Endpoints de Conversaciones

Rutas protegidas con Sanctum.

### Listar conversaciones del usuario autenticado

- Metodo: `GET /conversations`

Respuesta 200:

```json
[
  {
    "id": 1,
    "name": null,
    "type": "private",
    "users": [
      {
        "id": 1,
        "name": "Admin"
      }
    ],
    "created_at": "2026-04-18T12:00:00.000000Z",
    "updated_at": "2026-04-18T12:00:00.000000Z"
  }
]
```

Nota: este endpoint devuelve arreglo directo (sin envoltura `data`).

### Crear conversacion

- Metodo: `POST /conversations`
- Body:

```json
{
  "user_ids": [2, 3]
}
```

Reglas:

- `user_ids`: requerido, array
- `type` se calcula automaticamente:
- `group` si envias mas de un usuario
- `private` si envias solo uno

Respuesta 201:

```json
{
  "id": 10,
  "name": null,
  "type": "group",
  "users": [
    { "id": 1, "name": "Auth User" },
    { "id": 2, "name": "Usuario 2" },
    { "id": 3, "name": "Usuario 3" }
  ],
  "created_at": "2026-04-18T12:00:00.000000Z",
  "updated_at": "2026-04-18T12:00:00.000000Z"
}
```

## 10) Endpoint de Mensajes

Ruta protegida con Sanctum.

### Crear mensaje

- Metodo: `POST /messages`
- Body:

```json
{
  "conversation_id": 10,
  "content": "Hola equipo"
}
```

Validaciones:

- `conversation_id`: requerido, existe en conversations
- `content`: requerido, string

Respuesta 200:

```json
{
  "id": 30,
  "conversation_id": 10,
  "sender_id": 1,
  "content": "Hola equipo",
  "type": "text",
  "created_at": "2026-04-18T12:00:00.000000Z",
  "updated_at": "2026-04-18T12:00:00.000000Z"
}
```

Adicionalmente, el backend emite un evento de broadcast (`MessageSent`) para realtime.

## 11) Manejo de errores para Next.js

Para validaciones Laravel (422), normalmente recibiras:

```json
{
  "message": "The given data was invalid.",
  "errors": {
    "email": [
      "The email field is required."
    ]
  }
}
```

Recomendacion en frontend:

- Mostrar `message` como resumen.
- Mostrar `errors[field][0]` debajo de cada input.

## 12) Ejemplo rapido de cliente API en Next.js

```ts
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api';

type ApiOptions = RequestInit & {
  token?: string;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  headers.set('Content-Type', 'application/json');

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    cache: 'no-store',
  });

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    throw {
      status: response.status,
      payload,
    };
  }

  return payload as T;
}
```

## 13) Checklist de integracion

- Guardar `access_token` despues de login.
- Enviar `Authorization: Bearer ...` en rutas protegidas.
- Manejar `401` para sesion expirada/no autenticada.
- Manejar `422` para validaciones de formularios.
- Considerar inconsistencias de formato de respuesta:
- Algunos endpoints devuelven `{ data: ... }`.
- Conversaciones y mensajes devuelven objeto/arreglo directo.

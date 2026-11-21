import { zodResolver } from '@hookform/resolvers/zod'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ErrorBox, Field, OkBox, inputClass, primaryButton } from '@/components/Field'
import { useAuth } from '@/hooks/useAuth'
import { mensajeDeError } from '@/services/http'
import {
  cambiarEstado, cerrarSesiones, crearUsuario, editarUsuario, listarUsuarios,
  type FiltrosUsuarios, type Pagina, type UsuarioApi,
} from '@/services/usersApi'
import { ROLES, type Role } from '@/types/auth'
import { claveSchema, telefonoSchema, usernameSchema } from '@/utils/validation'

const nuevoSchema = z.object({
  first_name: z.string().trim().min(1, 'Requerido').max(150),
  last_name: z.string().trim().min(1, 'Requerido').max(150),
  username: usernameSchema,
  email: z.email('Correo no válido'),
  telefono: telefonoSchema,
  password: claveSchema,
})
type NuevoForm = z.input<typeof nuevoSchema>

function RolesCheckboxes({ value, onChange }: { value: Role[]; onChange: (r: Role[]) => void }) {
  return (
    <fieldset>
      <legend className="text-sm font-medium text-slate-700">Roles</legend>
      <div className="mt-1 flex flex-wrap gap-3">
        {ROLES.map((r) => (
          <label key={r} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={value.includes(r)}
              onChange={(e) => onChange(e.target.checked ? [...value, r] : value.filter((x) => x !== r))}
            />
            {r}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function NuevoUsuario({ onCreado }: { onCreado: () => void }) {
  const [roles, setRoles] = useState<Role[]>([])
  const [err, setErr] = useState<string | null>(null)
  const {
    register, handleSubmit, reset,
    formState: { errors, isSubmitting },
  } = useForm<NuevoForm, unknown, z.output<typeof nuevoSchema>>({ resolver: zodResolver(nuevoSchema) })

  const onSubmit = async (v: z.output<typeof nuevoSchema>) => {
    setErr(null)
    try {
      await crearUsuario({ ...v, roles })
      reset()
      setRoles([])
      onCreado()
    } catch (e) {
      setErr(mensajeDeError(e))
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4 rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <h2 className="text-lg font-semibold text-navy">Nuevo usuario</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field id="n_first" label="Nombres" registration={register('first_name')} error={errors.first_name} />
        <Field id="n_last" label="Apellidos" registration={register('last_name')} error={errors.last_name} />
        <Field id="n_user" label="Usuario" registration={register('username')} error={errors.username} />
        <Field id="n_email" label="Correo" type="email" registration={register('email')} error={errors.email} />
        <Field id="n_tel" label="Teléfono" registration={register('telefono')} error={errors.telefono} />
        <Field id="n_pass" label="Contraseña inicial" type="password" autoComplete="new-password" registration={register('password')} error={errors.password} />
      </div>
      <RolesCheckboxes value={roles} onChange={setRoles} />
      <ErrorBox message={err} />
      <button type="submit" disabled={isSubmitting} className={`${primaryButton} sm:w-auto`}>
        Crear usuario
      </button>
    </form>
  )
}

function FilaUsuario({ u, esYo, onCambio, onMensaje }: {
  u: UsuarioApi; esYo: boolean; onCambio: () => void; onMensaje: (ok: string | null, err: string | null) => void
}) {
  const [editando, setEditando] = useState(false)
  const [roles, setRoles] = useState<Role[]>(u.roles)

  const ejecutar = async (accion: () => Promise<string | void>) => {
    try {
      const msg = await accion()
      onMensaje(msg ?? 'Cambios guardados.', null)
      onCambio()
    } catch (e) {
      onMensaje(null, mensajeDeError(e))
    }
  }

  return (
    <tr className="border-t border-slate-200 align-top">
      <td className="px-3 py-3">
        <p className="font-medium text-navy">{u.first_name} {u.last_name}</p>
        <p className="text-xs text-slate-500">@{u.username} · {u.email}</p>
      </td>
      <td className="px-3 py-3">
        {editando ? (
          <div className="space-y-2">
            <RolesCheckboxes value={roles} onChange={setRoles} />
            <div className="flex gap-2">
              <button type="button" className="rounded bg-brand px-3 py-1 text-xs font-semibold text-white"
                onClick={() => ejecutar(async () => { await editarUsuario(u.id, { roles }); setEditando(false) })}>
                Guardar
              </button>
              <button type="button" className="rounded border border-slate-300 px-3 py-1 text-xs"
                onClick={() => { setRoles(u.roles); setEditando(false) }}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <span className="text-sm">{u.roles.length ? u.roles.join(', ') : <em className="text-slate-400">sin rol</em>}</span>
        )}
      </td>
      <td className="px-3 py-3">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
          {u.is_active ? 'Activo' : 'Inactivo'}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" className="rounded border border-slate-300 px-2 py-1 hover:bg-surface" onClick={() => setEditando(true)}>
            Editar roles
          </button>
          <button type="button" disabled={esYo && u.is_active} title={esYo ? 'No puedes desactivar tu propia cuenta' : undefined}
            className="rounded border border-slate-300 px-2 py-1 hover:bg-surface disabled:opacity-40"
            onClick={() => ejecutar(async () => { await cambiarEstado(u.id, !u.is_active) })}>
            {u.is_active ? 'Desactivar' : 'Activar'}
          </button>
          <button type="button" className="rounded border border-slate-300 px-2 py-1 hover:bg-surface"
            onClick={() => ejecutar(async () => (await cerrarSesiones(u.id)).detail)}>
            Cerrar sesiones
          </button>
        </div>
      </td>
    </tr>
  )
}

export function UsersPage() {
  const { user } = useAuth()
  const [filtros, setFiltros] = useState<FiltrosUsuarios>({ search: '', rol: '', is_active: '', page: 1 })
  const [datos, setDatos] = useState<Pagina<UsuarioApi> | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ok, setOk] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [recarga, setRecarga] = useState(0)
  const [mostrarNuevo, setMostrarNuevo] = useState(false)

  const recargar = useCallback(() => setRecarga((n) => n + 1), [])

  useEffect(() => {
    let cancelado = false
    listarUsuarios(filtros)
      .then((d) => { if (!cancelado) { setDatos(d); setErr(null); setCargando(false) } })
      .catch((e) => { if (!cancelado) { setErr(mensajeDeError(e)); setCargando(false) } })
    return () => { cancelado = true }
  }, [filtros, recarga])

  const cambiarFiltro = (parcial: Partial<FiltrosUsuarios>) => {
    setCargando(true)
    setFiltros((f) => ({ ...f, ...parcial, page: parcial.page ?? 1 }))
  }
  const totalPaginas = datos ? Math.max(1, Math.ceil(datos.count / 20)) : 1

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Seguridad y control</p>
          <h1 className="text-2xl font-bold text-navy">Usuarios</h1>
        </div>
        <button type="button" className={`${primaryButton} sm:w-auto`} onClick={() => setMostrarNuevo((v) => !v)}>
          {mostrarNuevo ? 'Cerrar formulario' : 'Nuevo usuario'}
        </button>
      </div>

      {mostrarNuevo && <NuevoUsuario onCreado={() => { setOk('Usuario creado.'); setMostrarNuevo(false); recargar() }} />}

      <div className="grid gap-3 sm:grid-cols-3">
        <input aria-label="Buscar" placeholder="Buscar por nombre, usuario o correo" className={inputClass}
          value={filtros.search ?? ''} onChange={(e) => cambiarFiltro({ search: e.target.value })} />
        <select aria-label="Filtrar por rol" className={inputClass} value={filtros.rol ?? ''}
          onChange={(e) => cambiarFiltro({ rol: e.target.value as Role | '' })}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select aria-label="Filtrar por estado" className={inputClass} value={filtros.is_active ?? ''}
          onChange={(e) => cambiarFiltro({ is_active: e.target.value as 'true' | 'false' | '' })}>
          <option value="">Activos e inactivos</option>
          <option value="true">Solo activos</option>
          <option value="false">Solo inactivos</option>
        </select>
      </div>

      <OkBox message={ok} />
      <ErrorBox message={err} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Usuario</th><th className="px-3 py-2">Roles</th><th className="px-3 py-2">Estado</th><th className="px-3 py-2">Acciones</th></tr>
          </thead>
          <tbody>
            {cargando && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Cargando...</td></tr>}
            {!cargando && datos?.results.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No hay usuarios con esos filtros.</td></tr>}
            {!cargando && datos?.results.map((u) => (
              <FilaUsuario key={`${u.id}-${u.roles.join()}-${u.is_active}`} u={u} esYo={u.id === user?.id}
                onCambio={recargar} onMensaje={(o, e) => { setOk(o); setErr(e) }} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{datos?.count ?? 0} usuario(s)</span>
        <div className="flex items-center gap-2">
          <button type="button" disabled={(filtros.page ?? 1) <= 1} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarFiltro({ page: (filtros.page ?? 1) - 1 })}>Anterior</button>
          <span>Página {filtros.page ?? 1} de {totalPaginas}</span>
          <button type="button" disabled={(filtros.page ?? 1) >= totalPaginas} className="rounded border border-slate-300 px-3 py-1 disabled:opacity-40"
            onClick={() => cambiarFiltro({ page: (filtros.page ?? 1) + 1 })}>Siguiente</button>
        </div>
      </div>
    </div>
  )
}

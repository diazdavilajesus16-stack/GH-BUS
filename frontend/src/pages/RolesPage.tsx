import { useEffect, useState } from 'react'
import { ErrorBox } from '@/components/Field'
import { mensajeDeError } from '@/services/http'
import { listarRoles, type RolApi } from '@/services/usersApi'
import { NAV_MODULES } from '@/config/navigation'

export function RolesPage() {
  const [roles, setRoles] = useState<RolApi[] | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    listarRoles()
      .then((r) => { if (!cancelado) setRoles(r) })
      .catch((e) => { if (!cancelado) setErr(mensajeDeError(e)) })
    return () => { cancelado = true }
  }, [])

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-light">Seguridad y control</p>
        <h1 className="text-2xl font-bold text-navy">Roles y permisos</h1>
        <p className="text-sm text-slate-500">
          Los roles son fijos (los define la especificación). Para asignarlos a una persona usa la pantalla Usuarios.
        </p>
      </div>
      <ErrorBox message={err} />
      <div className="grid gap-4 md:grid-cols-2">
        {roles?.map((r) => {
          const pantallas = NAV_MODULES.flatMap((m) => m.items.filter((i) => i.roles.includes(r.nombre)).map((i) => i.label))
          return (
            <article key={r.nombre} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
              <div className="flex items-start justify-between">
                <h2 className="text-lg font-semibold capitalize text-navy">{r.nombre}</h2>
                <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-slate-600">{r.usuarios_activos} activo(s)</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">{r.descripcion}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Pantallas del panel</p>
              <p className="text-sm text-slate-700">{pantallas.length ? pantallas.join(' · ') : 'Ninguna (solo «Mi cuenta»)'}</p>
            </article>
          )
        })}
      </div>
    </div>
  )
}

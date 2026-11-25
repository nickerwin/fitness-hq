import { useEffect, useRef, useState } from 'react'
import { disablePush, enablePush, pushState, testNotification, type PushState } from '../lib/push'
import { useSync } from '../lib/sync'
import { eraseLogs, exportAll, importAll, importProgram } from '../db'
import { saveSettings, useProgram, useSettings } from '../hooks'
import { NavBar, Row, Section, useToast } from '../components/ui'
import { SyncStatusLine } from './CloudSync'
import { fmtDate, mondayOf } from '../lib/dates'
import type { Macros } from '../types'

export default function Settings() {
  const settings = useSettings()
  const program = useProgram()
  const [toast, show] = useToast()
  const progFile = useRef<HTMLInputElement>(null)
  const backupFile = useRef<HTMLInputElement>(null)
  const [t, setT] = useState<Record<keyof Macros, string> | null>(null)
  const targets = t ?? {
    kcal: String(settings.targets.kcal),
    protein: String(settings.targets.protein),
    carbs: String(settings.targets.carbs),
    fat: String(settings.targets.fat),
  }
  const saveTargets = async () => {
    await saveSettings({ targets: { kcal: +targets.kcal, protein: +targets.protein, carbs: +targets.carbs, fat: +targets.fat } })
    setT(null)
    show('Targets saved')
  }

  const download = async () => {
    const data = await exportAll()
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `fitness-hq-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const readJson = (file: File) => file.text().then((s) => JSON.parse(s))

  return (
    <>
      <NavBar title="Settings" back="Summary" />
      <div className="page">
        <Section title="Daily Targets">
          <div className="list">
            {(
              [
                ['kcal', 'Calories', 'kcal'],
                ['protein', 'Protein', 'g'],
                ['carbs', 'Carbs', 'g'],
                ['fat', 'Fat', 'g'],
              ] as const
            ).map(([k, l, u]) => (
              <div className="field" key={k}>
                <label>{l}</label>
                <input inputMode="numeric" value={targets[k]} onChange={(e) => setT({ ...targets, [k]: e.target.value })} />
                <span className="muted" style={{ width: 30 }}>{u}</span>
              </div>
            ))}
          </div>
          {t && (
            <button className="btn" style={{ marginTop: 8 }} onClick={saveTargets}>
              Save Targets
            </button>
          )}
          <p className="footnote" style={{ padding: '6px 4px' }}>Changing targets doesn't rewrite past logs.</p>
        </Section>

        <Section title="Program">
          <div className="list">
            <div className="field">
              <label>Active program</label>
              <span className="muted">{program?.name}</span>
            </div>
            <div className="field">
              <label>Week 1 starts</label>
              <input type="date" value={settings.programStart} onChange={(e) => e.target.value && saveSettings({ programStart: mondayOf(e.target.value) })} />
            </div>
            <div className="field">
              <label>Use full-gym swaps</label>
              <input type="checkbox" checked={settings.useSubstitutes} onChange={(e) => saveSettings({ useSubstitutes: e.target.checked })} style={{ width: 24, height: 24 }} />
            </div>
          </div>
          <p className="footnote" style={{ padding: '6px 4px' }}>
            Week 1 is the week of {fmtDate(settings.programStart, { month: 'long', day: 'numeric' })}. Turn on full-gym swaps after the move: Smith bench becomes barbell bench, and so on. {program?.gymSwapNote}
          </p>
          <button className="btn secondary" onClick={() => progFile.current?.click()}>
            Import Program File…
          </button>
          <input
            ref={progFile}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (!f) return
              try {
                await importProgram(await readJson(f))
                show('Program imported')
              } catch (err) {
                show(`Import failed: ${(err as Error).message}`)
              }
              e.target.value = ''
            }}
          />
        </Section>

        <Section title="Sync & Health">
          <div className="list">
            <Row to="/sync" trail={<SyncStatusLine />}>
              Cloud Sync
            </Row>
            <Row to="/health">Apple Health</Row>
          </div>
        </Section>

        <NotificationsSection show={show} />

        <Section title="Your Data">
          <p className="footnote" style={{ padding: '0 4px 8px' }}>
            Everything is saved on this iPhone first, so it works offline at the gym. Cloud Sync keeps a copy online. A backup file is a handy extra copy you can keep in Files.
          </p>
          <div className="stack">
            <button className="btn secondary" onClick={download}>
              Export Backup
            </button>
            <button className="btn secondary" onClick={() => backupFile.current?.click()}>
              Restore Backup…
            </button>
            <input
              ref={backupFile}
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (!window.confirm('Replace all data on this device with the backup? With cloud sync on, the backup becomes the latest version everywhere.')) return
                try {
                  await importAll(await readJson(f))
                  show('Backup restored')
                } catch (err) {
                  show(`Restore failed: ${(err as Error).message}`)
                }
                e.target.value = ''
              }}
            />
            <button
              className="btn danger"
              onClick={async () => {
                if (!window.confirm('Erase all workouts, food logs, measurements and check-ins? With cloud sync on, this erases them everywhere.')) return
                await eraseLogs()
                show('Data erased')
              }}
            >
              Erase All Logs
            </button>
          </div>
        </Section>
        <p className="footnote" style={{ textAlign: 'center', padding: 24 }}>Fitness HQ · v{__APP_VERSION__}</p>
      </div>
      {toast}
    </>
  )
}

function NotificationsSection({ show }: { show: (m: string) => void }) {
  const sync = useSync()
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'))
  }, [])
  const signedIn = sync.status !== 'off'
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try {
      await fn()
      setState(await pushState())
      show(ok)
    } catch (e) {
      show((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  let body
  if (state === null) body = null
  else if (state === 'needs-home-screen') body = <p className="footnote" style={{ padding: '0 4px' }}>Open Fitness HQ from its Home Screen icon (not Safari) to turn on notifications.</p>
  else if (state === 'unsupported') body = <p className="footnote" style={{ padding: '0 4px' }}>This device or browser doesn't support notifications. On iPhone, update to iOS 16.4 or later.</p>
  else if (state === 'denied') body = <p className="footnote" style={{ padding: '0 4px' }}>Notifications are blocked. Turn them on in iPhone Settings → Notifications → Fitness HQ, then come back here.</p>
  else if (!signedIn) body = <p className="footnote" style={{ padding: '0 4px' }}>Turn on Cloud Sync first. The coach sends notifications through your cloud account.</p>
  else if (state === 'off')
    body = (
      <button className="btn" disabled={busy} onClick={() => run(enablePush, 'Notifications on')}>
        Turn On Notifications
      </button>
    )
  else
    body = (
      <div className="stack">
        <button className="btn secondary" disabled={busy} onClick={() => run(testNotification, 'Sent a test')}>
          Send Test Notification
        </button>
        <button className="btn danger" disabled={busy} onClick={() => run(disablePush, 'Notifications off')}>
          Turn Off Notifications
        </button>
      </div>
    )
  return (
    <Section title="Notifications">
      <p className="footnote" style={{ padding: '0 4px 8px' }}>
        {state === 'on' ? 'On. ' : ''}Get the coach's post-workout note on your lock screen, about an hour or less after you finish.
      </p>
      {body}
    </Section>
  )
}

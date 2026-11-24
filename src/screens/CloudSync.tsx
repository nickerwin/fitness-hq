import { useState } from 'react'
import { NavBar, Section, useToast } from '../components/ui'
import { createCoachToken, getConfig, revokeCoachTokens, saveConfig, signIn, signOut, signUp, syncNow, refreshSyncState, useSync } from '../lib/sync'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import setupSql from '../../supabase/setup.sql?raw'

export async function copy(text: string, show: (m: string) => void, label = 'Copied') {
  try {
    await navigator.clipboard.writeText(text)
    show(label)
  } catch {
    window.prompt('Copy this:', text)
  }
}

export function SyncStatusLine() {
  const s = useSync()
  const color = s.status === 'error' ? 'var(--red)' : s.status === 'offline' ? 'var(--steps)' : s.status === 'off' ? 'var(--text-3)' : 'var(--nutri)'
  const text =
    s.status === 'off'
      ? 'Off'
      : s.status === 'syncing'
        ? 'Syncing…'
        : s.status === 'error'
          ? 'Sync problem'
          : s.status === 'offline'
            ? 'Offline'
            : s.lastSync
              ? `Synced ${new Date(s.lastSync).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
              : 'On'
  return (
    <span className="row" style={{ gap: 6 }}>
      <span className="status-dot" style={{ background: color }} />
      {text}
    </span>
  )
}

export default function CloudSync() {
  const s = useSync()
  const [toast, show] = useToast()
  const cfg = getConfig()
  const [url, setUrl] = useState(cfg?.url ?? '')
  const [key, setKey] = useState(cfg?.key ?? '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(!cfg)
  const signedIn = s.status !== 'off'
  const coachToken = useLiveQuery(async () => ((await db.meta.get('coach.token'))?.value as string | undefined) ?? '', [])

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      show((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const saveProject = () => {
    if (!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20) return show('Check the URL and key')
    saveConfig({ url, key })
    refreshSyncState()
    setEditing(false)
    show('Project saved')
  }

  return (
    <>
      <NavBar title="Cloud Sync" back="Settings" />
      <div className="page">
        <div className="card" style={{ marginTop: 8 }}>
          <div className="card-head">
            Status
            <span className="when">
              <SyncStatusLine />
            </span>
          </div>
          <div className="footnote" style={{ marginTop: 6 }}>
            {signedIn
              ? `Signed in as ${s.email}. Workouts, food, measurements, check-ins and settings back up automatically and sync to any device you sign in on.`
              : 'Back up everything to a free Supabase project you own, and use the app on more than one device. The app still works fully offline: changes sync when you are back online.'}
          </div>
          {s.message && (
            <div className="footnote" style={{ marginTop: 6, color: s.status === 'error' ? 'var(--red)' : undefined }}>
              {s.message}
            </div>
          )}
          {signedIn && (
            <div className="stack" style={{ marginTop: 12 }}>
              <button className="btn" disabled={busy || s.status === 'syncing'} onClick={() => run(async () => { await syncNow(); show('Synced') })}>
                Sync Now
              </button>
              <button className="btn danger" onClick={() => window.confirm('Sign out? Data stays on this iPhone and in the cloud.') && signOut()}>
                Sign Out
              </button>
            </div>
          )}
        </div>

        {signedIn && cfg && (
          <Section title="Coach Access">
            <div className="card">
              <div className="footnote" style={{ fontSize: 14 }}>
                A read-only key that lets your coach (Claude) read your synced workouts, food, weight and check-ins. It can't change or delete anything, and you can revoke it any time.
              </div>
              {coachToken ? (
                <>
                  <div className="copy-row" style={{ marginTop: 10 }}>
                    <span className="code">{coachToken}</span>
                  </div>
                  <div className="stack" style={{ marginTop: 10 }}>
                    <button className="btn" onClick={() => copy(`Fitness HQ coach access\nURL: ${cfg.url}\nKey: ${cfg.key}\nCoach key: ${coachToken}`, show, 'Copied. Paste it to Claude')}>
                      Copy for Claude
                    </button>
                    <button
                      className="btn danger"
                      disabled={busy}
                      onClick={() => window.confirm('Revoke coach access? Claude will no longer be able to read your data.') && run(async () => { await revokeCoachTokens(); show('Coach access revoked') })}
                    >
                      Revoke Coach Access
                    </button>
                  </div>
                </>
              ) : (
                <button className="btn secondary" style={{ marginTop: 10 }} disabled={busy} onClick={() => run(createCoachToken)}>
                  Create Coach Key
                </button>
              )}
              <p className="footnote" style={{ marginTop: 8 }}>If this says the key is unknown, copy the setup script again and run it once more in Supabase. It adds coach access.</p>
            </div>
          </Section>
        )}

        {!signedIn && (
          <>
            {editing ? (
              <Section title="1. Create Your Free Project">
                <div className="card">
                  <ol className="steps-list">
                    <li>
                      Go to <b>supabase.com</b>, sign up (GitHub sign-in works) and create a <b>New project</b> on the free plan. Any name and region, and save the database password somewhere.
                    </li>
                    <li>
                      Open <b>SQL Editor</b>, paste the setup script and press <b>Run</b>.
                      <div className="copy-row">
                        <button className="btn small" onClick={() => copy(setupSql, show, 'Setup script copied')}>
                          Copy Setup Script
                        </button>
                      </div>
                    </li>
                    <li>
                      Open <b>Authentication → Sign In / Providers → Email</b> and turn off <b>Confirm email</b>, so you can sign in here right away.
                    </li>
                    <li>
                      Open <b>Project Settings → API Keys</b> (or <b>Connect</b>). Copy the <b>Project URL</b> and the <b>publishable</b> (or <b>anon</b>) key into the fields below.
                    </li>
                  </ol>
                </div>
                <div className="list" style={{ marginTop: 8 }}>
                  <div className="field">
                    <label>Project URL</label>
                    <input type="url" autoCapitalize="off" autoCorrect="off" placeholder="https://xyz.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Key</label>
                    <input autoCapitalize="off" autoCorrect="off" placeholder="sb_publishable_…" value={key} onChange={(e) => setKey(e.target.value)} />
                  </div>
                </div>
                <button className="btn" style={{ marginTop: 8 }} onClick={saveProject}>
                  Save Project
                </button>
                <p className="footnote" style={{ padding: '6px 4px' }}>The key is meant to be public. Your data is protected by your account sign-in.</p>
              </Section>
            ) : (
              <Section title="Sign In">
                <div className="list">
                  <div className="field">
                    <label>Email</label>
                    <input type="email" autoCapitalize="off" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="field">
                    <label>Password</label>
                    <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </div>
                <div className="stack" style={{ marginTop: 8 }}>
                  <button className="btn" disabled={busy || !email || password.length < 6} onClick={() => run(async () => { await signIn(email.trim(), password); show('Signed in') })}>
                    Sign In
                  </button>
                  <button
                    className="btn secondary"
                    disabled={busy || !email || password.length < 6}
                    onClick={() =>
                      run(async () => {
                        const r = await signUp(email.trim(), password)
                        show(r === 'signed-in' ? 'Account created' : 'Check your email to confirm, then sign in')
                      })
                    }
                  >
                    Create Account
                  </button>
                  <button className="btn danger" onClick={() => setEditing(true)}>
                    Change Project
                  </button>
                </div>
                <p className="footnote" style={{ padding: '6px 4px' }}>
                  First time on this project? Use Create Account (at least 6 characters). On your other devices, use Sign In with the same email. Your existing data on this iPhone is uploaded when you sign in.
                </p>
              </Section>
            )}
          </>
        )}
      </div>
      {toast}
    </>
  )
}

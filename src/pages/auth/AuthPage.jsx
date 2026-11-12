import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, GraduationCap, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/UI.jsx'
import { useApp } from '../../hooks/useApp.js'
import { authService } from '../../services/authService.js'

const roles = ['Admin', 'Teacher', 'Student', 'Parent']
const demoEmails = {
  Admin: 'admin@acadex.demo',
  Teacher: 'teacher@acadex.demo',
  Student: 'student@acadex.demo',
  Parent: 'parent@acadex.demo',
}

export default function AuthPage({ mode }) {
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [role, setRole] = useState('Admin')
  const [email, setEmail] = useState(searchParams.get('email') || (mode === 'register' ? '' : 'admin@acadex.demo'))
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [verificationCode, setVerificationCode] = useState('')
  const [verificationSent, setVerificationSent] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { authError, login, register: signUp, verifyRegistration, googleRegister } = useApp()
  const navigate = useNavigate()
  const googleButtonRef = useRef(null)
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const isRegister = mode === 'register'
  const forgot = mode === 'forgot'
  const reset = mode === 'reset'
  const resetToken = searchParams.get('token') || ''
  const returnPath = location.state?.from
  const returnTo = returnPath?.pathname?.startsWith('/portal/')
    ? `${returnPath.pathname}${returnPath.search || ''}${returnPath.hash || ''}`
    : '/portal'

  useEffect(() => {
    if (!isRegister || !googleClientId || verificationSent) return undefined

    let active = true
    const renderGoogleButton = () => {
      if (!active || !window.google?.accounts?.id || !googleButtonRef.current) return
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async ({ credential }) => {
          setNotice('')
          setError('')
          setSubmitting(true)
          try {
            await googleRegister(credential)
            navigate('/portal')
          } catch (requestError) {
            setError(requestError.message)
          } finally {
            setSubmitting(false)
          }
        },
      })
      googleButtonRef.current.replaceChildren()
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signup_with',
        width: 360,
      })
    }

    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = renderGoogleButton
    script.onerror = () => setError('Google sign-up could not be loaded. Please try again later.')
    document.head.appendChild(script)
    return () => {
      active = false
      script.remove()
    }
  }, [googleClientId, googleRegister, isRegister, navigate, verificationSent])

  async function submit(event) {
    event.preventDefault()
    setNotice('')
    setError('')
    setSubmitting(true)
    try {
      if (forgot) {
        const result = await authService.forgotPassword(email.trim())
        setNotice(result.message)
      } else if (reset) {
        if (!resetToken) throw new Error('This password-reset link is incomplete or expired.')
        await authService.resetPassword(email.trim(), resetToken, password)
        setNotice('Your password has been updated. You can sign in now.')
      } else if (isRegister) {
        if (verificationSent) {
          await verifyRegistration(email.trim(), verificationCode.trim())
          navigate('/portal')
        } else {
          const result = await signUp(name.trim(), email.trim(), password)
          setVerificationSent(true)
          setNotice(result.message)
        }
      } else {
        await login(email.trim(), password)
        navigate(returnTo, { replace: true })
      }
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  async function resendRegistrationCode() {
    setNotice('')
    setError('')
    setSubmitting(true)
    try {
      const result = await authService.resendRegistrationCode(email.trim())
      setNotice(result.message)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-brand">
        <Link to="/" className="brand"><span className="brand-mark"><GraduationCap size={19} /></span><span>acadex</span></Link>
        <span className="auth-secure"><ShieldCheck size={14} /> A thoughtful space for your school</span>
      </div>
      <div className="auth-decoration">
        <div className="auth-deco-card">
          <span className="auth-deco-star"><Sparkles size={17} /></span>
          <small>YOUR SCHOOL, IN SYNC</small>
          <strong>Better days<br />start together.</strong>
          <div className="auth-deco-people"><span>AM</span><span>SC</span><span>JR</span><span>+84</span></div>
        </div>
        <div className="auth-deco-caption"><span>✳</span> A calmer way to do school.</div>
      </div>
      <main className="auth-main">
        <div className="auth-card">
          <Link to="/" className="back-home"><ArrowLeft size={15} /> Back to home</Link>
          <div className="auth-heading">
            <span className="auth-mobile-icon"><GraduationCap size={20} /></span>
            <h1>{isRegister ? verificationSent ? 'Check your inbox.' : 'Find your school’s rhythm.' : forgot ? 'A fresh start.' : reset ? 'Make it yours again.' : 'Welcome back.'}</h1>
            <p>{isRegister ? verificationSent ? 'Enter the six-digit code we sent to verify your email.' : 'Create a student account with any email address. Verify your email to activate it.' : forgot ? 'Enter your email and we’ll send a reset link your way.' : reset ? 'Choose a new password for your Acadex account.' : 'Pick up right where your school day left off.'}</p>
          </div>

          {!isRegister && !forgot && !reset && (
            <div className="role-picker">
              <label>Choose a demo account</label>
              <div className="role-options">
                {roles.map((item) => (
                  <button
                    type="button"
                    className={role === item ? 'role-option role-selected' : 'role-option'}
                    key={item}
                    onClick={() => { setRole(item); setEmail(demoEmails[item]) }}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} className="auth-form">
            {isRegister && !verificationSent && <label>Full name<input type="text" placeholder="How should we call you?" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} maxLength={120} /></label>}
            <label>
              Email address
              <span className="input-icon"><Mail size={16} /><input type="email" placeholder="you@school.edu" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" readOnly={isRegister && verificationSent} /></span>
            </label>
            {isRegister && verificationSent && <label>Verification code<input type="text" inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" value={verificationCode} onChange={(event) => setVerificationCode(event.target.value)} required minLength={6} maxLength={6} pattern="[0-9]{6}" /></label>}
            {!forgot && !(isRegister && verificationSent) && (
              <label>
                {reset ? 'New password' : 'Password'}
                <span className="input-icon"><LockKeyhole size={16} /><input type="password" placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} maxLength={128} autoComplete={reset ? 'new-password' : isRegister ? 'new-password' : 'current-password'} /></span>
              </label>
            )}
            {!isRegister && !forgot && !reset && <div className="auth-inline"><label className="remember-check"><input type="checkbox" /> Remember me</label><Link to="/forgot-password">Forgot password?</Link></div>}
            {(error || authError) && <p className="auth-notice" role="alert">{error || authError}</p>}
            {notice && <p className="auth-notice" role="status">{notice}</p>}
            <Button type="submit" className="auth-submit" disabled={submitting}>
              {submitting ? 'Please wait…' : forgot ? 'Send reset link' : reset ? 'Update password' : isRegister ? verificationSent ? 'Verify email address' : 'Create your account' : 'Sign in to Acadex'} <ArrowRight size={16} />
            </Button>
          </form>

          {isRegister && verificationSent && <button type="button" className="auth-resend" onClick={resendRegistrationCode} disabled={submitting}>Resend verification code</button>}
          {isRegister && !verificationSent && googleClientId && <div className="google-signup">
            <span>or create an account with</span>
            <div ref={googleButtonRef} />
          </div>}

          {(forgot || reset) && <p className="auth-switch"><Link to="/login"><ArrowLeft size={14} /> Back to sign in</Link></p>}
          {!forgot && !reset && <p className="auth-switch">{isRegister ? 'Already part of Acadex?' : 'New to Acadex?'} <Link to={isRegister ? '/login' : '/register'}>{isRegister ? 'Sign in' : 'Create an account'}</Link></p>}
          <p className="auth-legal">By continuing, you agree to Acadex’s <a href="#terms">Terms</a> and <a href="#privacy">Privacy Policy</a>.</p>
        </div>
      </main>
      <footer className="auth-footer"><span>© 2026 Acadex</span><span>Made for the people behind every school day.</span></footer>
    </div>
  )
}

import { Link } from 'react-router-dom';
import Icon from '../components/Icon';

const WHY = [
  { icon: 'send', title: 'Automatic reminders', text: 'A WhatsApp message goes out every day for the last 4 days of a membership. You do nothing.' },
  { icon: 'phone', title: 'Your own number', text: 'Members hear from your gym on the WhatsApp number they already know, not from a stranger.' },
  { icon: 'refresh', title: 'One-tap renewals', text: 'Mark a member renewed when they pay. Their date moves forward and the reminders stop.' },
  { icon: 'users', title: 'Members stay in control', text: 'Anyone can reply STOP to opt out, and you can switch reminders off for a member yourself.' }
];

const STEPS = [
  { title: 'Link your WhatsApp', text: 'Scan a QR code or type a code once, the same way you link WhatsApp on a computer.' },
  { title: 'Add your members', text: 'Type them in, pick them from your contacts, or upload your spreadsheet.' },
  { title: 'GymPing does the rest', text: 'Reminders go out on time with your renewal link. Your dashboard shows who was told and who renewed.' }
];

export default function Landing() {
  return (
    <div className="landing">
      <header className="land-head">
        <div className="wrap">
          <Link to="/" className="land-logo">
            <Icon name="dumbbell" size={26} />
            <span>Gym<b>Ping</b></span>
          </Link>
          <nav className="land-nav" aria-label="Main">
            <a href="#why" className="hide-sm">Why GymPing</a>
            <a href="#how" className="hide-sm">How it works</a>
            <Link to="/login">Log in</Link>
            <Link to="/signup" className="btn sm">Get started</Link>
          </nav>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div>
            <span className="kicker">Never lose a renewal</span>
            <h1>
              Remind them <em>before</em> it ends
            </h1>
            <p className="lede">
              GymPing sends your members a WhatsApp reminder before their membership expires, so
              nobody gets turned away at the door and you stop losing renewals to forgetfulness.
            </p>
            <div className="hero-actions">
              <Link to="/signup" className="btn lg">Get started</Link>
              <Link to="/login" className="btn lg outline">Log in</Link>
            </div>
          </div>

          <div className="phone" aria-label="Example reminder message">
            <div className="phone-top">
              <div className="avatar" aria-hidden="true">FZ</div>
              <div>
                <strong>FitZone Gym</strong>
                <span>online</span>
              </div>
            </div>
            <div className="phone-body">
              <span className="when">Today</span>
              <div className="bubble">
                Hey Sarah! 👋 Your membership at FitZone expires in 4 days (Nov 19). Renew now to
                keep your streak going: fitzone.example/renew
              </div>
              <div className="bubble in">Done, renewed! 💪</div>
            </div>
          </div>
        </div>
      </section>

      <section className="land-section alt" id="why">
        <div className="wrap">
          <div className="land-title">
            <span>Why GymPing</span>
            <h2>Keep every member coming back</h2>
          </div>
          <div className="why">
            {WHY.map((w) => (
              <div className="why-item" key={w.title}>
                <div className="why-icon"><Icon name={w.icon} size={28} /></div>
                <h3>{w.title}</h3>
                <p>{w.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="land-section" id="how">
        <div className="wrap">
          <div className="land-title">
            <span>How it works</span>
            <h2>Set up in three steps</h2>
          </div>
          <div className="steps-grid">
            {STEPS.map((s, i) => (
              <div className="step-card" key={s.title}>
                <div className="step-num" aria-hidden="true">0{i + 1}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="cta">
        <div className="wrap">
          <h2>Stop losing members to forgotten renewals</h2>
          <p>Your gym. Your number. Your look.</p>
          <Link to="/signup" className="btn lg outline">Create your account</Link>
        </div>
      </section>

      <footer className="land-foot">
        <div className="wrap">
          <p>© {new Date().getFullYear()} GymPing. Not affiliated with WhatsApp or Meta.</p>
          <nav aria-label="Legal">
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

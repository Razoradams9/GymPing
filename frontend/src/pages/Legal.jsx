import { Link } from 'react-router-dom';
import { OPERATOR } from '../legal-config';

// Plain-language starting drafts. Have a lawyer review them before selling.

function Page({ title, children }) {
  return (
    <div className="legal">
      <Link to="/" className="back">← Back to GymPing</Link>
      <h1>{title}</h1>
      <p className="updated">Last updated: {OPERATOR.lastUpdated}</p>
      {children}
      <h2>Contact</h2>
      <p>
        Questions or requests: <a href={`mailto:${OPERATOR.contactEmail}`}>{OPERATOR.contactEmail}</a>
      </p>
    </div>
  );
}

export function Privacy() {
  return (
    <Page title="Privacy Policy">
      <p>
        {OPERATOR.name} ("we") provides a tool that lets gym owners send WhatsApp reminders to their
        members before a membership ends. This policy explains what information the service holds,
        why, and who can see it.
      </p>

      <h2>Who is responsible for what</h2>
      <p>
        The gym owner decides which members to add and is responsible for that information (under
        India's Digital Personal Data Protection Act, 2023, the gym is the data fiduciary). We store
        and process it only to run the service for the gym (we act as the gym's data processor).
      </p>

      <h2>What we hold</h2>
      <ul>
        <li><strong>About the gym owner:</strong> gym name, email address, a scrambled (hashed) password, settings, and an optional logo.</li>
        <li><strong>About members, entered by the gym:</strong> name, phone number, membership end date, and whether reminders are switched off.</li>
        <li><strong>Reminder history:</strong> which reminders were sent or failed, when, and the message text.</li>
        <li><strong>WhatsApp link:</strong> the keys that keep the gym's WhatsApp number linked, and the contact names and numbers WhatsApp shares with a linked device, so the owner can pick members from their contacts.</li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or share member information with advertisers or anyone else.</li>
        <li>We do not read or store the gym's WhatsApp conversations. Incoming messages are checked only for a one-word "STOP" reply so a member can opt out; nothing else is kept.</li>
        <li>We do not message members for our own purposes.</li>
      </ul>

      <h2>Who can see member information</h2>
      <p>
        Only the gym that entered it, after logging in. Each gym's data is kept separate from every
        other gym's. Our own overseer screen shows account details and totals only (for example how
        many members a gym has and how many reminders were sent); it does not show members' names,
        numbers or messages.
      </p>
      <p>
        As the operator we have technical access to the database that stores this information. We
        access it only when needed to fix a fault, keep the service secure, or meet a legal
        obligation.
      </p>

      <h2>Where it is stored</h2>
      <p>
        Information is stored with our hosting and database providers, whose servers may be located
        outside India. Messages are delivered through WhatsApp, which handles them under its own
        privacy policy.
      </p>

      <h2>Members' choices</h2>
      <ul>
        <li>A member can reply STOP to a reminder, or ask their gym, to stop receiving reminders.</li>
        <li>A member can ask their gym to correct or delete their details. The gym can do this at any time from its Members page.</li>
        <li>If a gym does not respond, the member can contact us and we will pass the request on.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        Member details stay until the gym deletes them or closes its account. When a gym asks us to
        close its account we delete its members, reminder history and WhatsApp link within 30 days.
      </p>

      <h2>Security</h2>
      <p>
        Passwords are stored hashed, connections use HTTPS, and each gym can reach only its own
        data. No system is perfectly secure; if a breach affecting personal data occurs we will
        inform the affected gyms and the authorities as the law requires.
      </p>

      <h2>Changes</h2>
      <p>If this policy changes in an important way we will tell gym owners by email or in the app.</p>
    </Page>
  );
}

export function Terms() {
  return (
    <Page title="Terms of Use">
      <p>
        These terms apply to gym owners who create an account on {OPERATOR.name}. By creating an
        account you agree to them.
      </p>

      <h2>What the service does</h2>
      <p>
        {OPERATOR.name} sends automatic WhatsApp reminders, from your own WhatsApp number, to the
        members you add, in the days before their membership ends. It is not a payment processor or
        a full gym management system.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>Add only people who are your members and who have agreed to receive membership reminders from you on WhatsApp.</li>
        <li>Keep member details accurate, and switch off reminders for anyone who asks.</li>
        <li>Use the service only for membership reminders. No advertising to people who have not asked for it, and nothing unlawful, abusive or misleading.</li>
        <li>Keep your password private. You are responsible for what happens in your account.</li>
        <li>Follow the laws that apply to you, including data protection law and WhatsApp's own terms.</li>
      </ul>

      <h2>WhatsApp</h2>
      <p>
        {OPERATOR.name} is not affiliated with, endorsed by or supported by WhatsApp or Meta. It
        links to your number in the same way as WhatsApp's "Linked Devices" feature, which is not an
        official business messaging channel. WhatsApp may limit or ban numbers that send automated
        messages. You accept that risk; we recommend using a dedicated gym number and are not
        responsible if WhatsApp restricts your number.
      </p>

      <h2>Availability</h2>
      <p>
        We work to keep the service running, but it is provided "as is". Reminders can be delayed or
        missed, for example if your WhatsApp link is disconnected or the service is unavailable. Do
        not rely on it as your only way of telling members about renewals.
      </p>

      <h2>Accounts</h2>
      <p>
        New accounts may need our approval. We may suspend or close an account that breaks these
        terms or puts the service or other gyms at risk. You can stop using the service at any time
        and ask us to delete your account and data.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, we are not liable for lost revenue, lost memberships,
        restrictions placed on your WhatsApp number, or other indirect losses arising from use of
        the service. Our total liability is limited to the amount you paid us for the service in the
        12 months before the claim.
      </p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of {OPERATOR.jurisdiction}.</p>

      <h2>Changes</h2>
      <p>We may update these terms. If a change is important we will tell you before it takes effect.</p>
    </Page>
  );
}

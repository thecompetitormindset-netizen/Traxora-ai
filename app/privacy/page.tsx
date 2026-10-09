import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Traxora AI",
  description: "How Traxora AI collects, uses, and protects your information.",
};

const LAST_UPDATED = "June 8, 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="text-lg font-bold text-[#F1F5F9] mb-3">{title}</h2>
      <div className="text-sm text-[#7B8DB4] leading-relaxed space-y-3">{children}</div>
    </div>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen text-[#F1F5F9] px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="flex items-center gap-2 text-sm text-[#4B5675] hover:text-[#7B8DB4] transition-colors mb-12 w-fit">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to home
        </Link>

        <div className="mb-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
                <polyline points="16 7 22 7 22 13" />
              </svg>
            </div>
            <span className="font-bold text-[#F1F5F9]">Traxora AI</span>
          </div>
          <h1 className="text-4xl font-black mb-3">Privacy Policy</h1>
          <p className="text-sm text-[#4B5675]">Last updated: {LAST_UPDATED}</p>
        </div>

        <Section title="1. Who We Are">
          <p>Traxora AI (&ldquo;Traxora,&rdquo; &ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is a market analysis and signal research platform. Our service is available at traxora-ai.vercel.app.</p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong className="text-[#CBD5E1]">Account data:</strong> When you sign in with Google, we receive your name, email address, and profile picture from Google OAuth. We do not store passwords.</p>
          <p><strong className="text-[#CBD5E1]">Usage data:</strong> We log which features you use, signals you view, and general usage patterns to improve the product.</p>
          <p><strong className="text-[#CBD5E1]">Stored data:</strong> Your watchlist, trade journal entries, and settings are stored in your browser&apos;s localStorage and in our database (Supabase) linked to your account email. No financial account information is collected.</p>
          <p><strong className="text-[#CBD5E1]">Payment data:</strong> Traxora is free and does not collect payments. Earlier Ko-fi memberships were processed by Ko-fi; we only ever received membership status — no card or billing details reached our servers.</p>
        </Section>

        <Section title="3. How We Use Your Information">
          <p>We use your information to: authenticate your account, deliver the signals and analysis features you requested, send morning briefing emails (if subscribed), and improve the product.</p>
          <p>We do not sell your personal information to third parties.</p>
          <p>We do not use your data to train external AI models. Queries to our AI backend (Anthropic Claude) are governed by <a href="https://www.anthropic.com/privacy" className="text-emerald-400 hover:text-emerald-300 underline" target="_blank" rel="noopener noreferrer">Anthropic&apos;s Privacy Policy</a>.</p>
        </Section>

        <Section title="4. Cookies and Local Storage">
          <p>We use browser localStorage and sessionStorage to store your preferences, watchlist, and cached signal data. This data stays on your device and is scoped to your account email. We do not use third-party advertising cookies.</p>
        </Section>

        <Section title="5. Data Retention">
          <p>Your data is retained for as long as your account is active. You can delete your journal entries at any time from the Journal page. To request full account deletion, contact us at the email below.</p>
        </Section>

        <Section title="6. Third-Party Services">
          <p>We use the following third-party services whose own privacy policies govern their data handling:</p>
          <ul className="list-disc list-inside space-y-1 text-[#4B5675]">
            <li>Google OAuth (authentication)</li>
            <li>Ko-fi (earlier memberships only)</li>
            <li>Anthropic Claude (AI analysis)</li>
            <li>Resend (transactional email)</li>
            <li>Supabase (database)</li>
            <li>Vercel (hosting)</li>
          </ul>
        </Section>

        <Section title="7. Security">
          <p>We implement industry-standard security measures including HTTPS, JWT session tokens with short expiry, and row-level security on our database. No system is perfectly secure — use a strong Google account password and enable 2FA on your Google account.</p>
        </Section>

        <Section title="8. Children">
          <p>Traxora AI is not directed at children under 13. We do not knowingly collect data from children.</p>
        </Section>

        <Section title="9. Changes">
          <p>We may update this policy occasionally. We&apos;ll notify you of material changes via email or an in-app notice.</p>
        </Section>

        <Section title="10. Contact">
          <p>Questions about this policy? Email <a href="mailto:thecompetitormindset@gmail.com" className="text-emerald-400 hover:text-emerald-300 underline">thecompetitormindset@gmail.com</a>.</p>
        </Section>

        <div className="border-t border-[#252345] pt-8 flex gap-6 text-xs text-[#4B5675]">
          <Link href="/terms" className="hover:text-[#7B8DB4] transition-colors">Terms of Service</Link>
          <Link href="/" className="hover:text-[#7B8DB4] transition-colors">Back to Traxora AI</Link>
        </div>
      </div>
    </div>
  );
}

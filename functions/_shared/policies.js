// The policy pages: terms, refund policy, delivery policy, privacy and contact. They are linked from every footer and from the payment dialog, because
// a payment provider and customers expect to find them before paying (docs/PRICING_PLAN.md, "Things the code cannot decide").
//
// Written from what the product does today (docs/PRICING_PLAN.md, docs/RETENTION_PLAN.md, docs/RSVP_PLAN.md). Two kinds of line are
// business decisions that the owner confirms, and each lives in one place below:
//   REFUND_DAYS and the refund rules  (docs/POLICIES.md says what each default is and why)
//   BUSINESS.legalName and BUSINESS.address (shown on the contact page only when filled in)
// Nothing here is legal advice: have the pages read by a lawyer or accountant before you rely on them.

export const UPDATED = '15 November 2026';

// How many days after paying a customer can ask for their money back, when they change their mind.
export const REFUND_DAYS = 7;

// The seller's details, shown on the contact page (and only when set). The name is the trading name; replace it with the registered
// legal name if that differs, and the address with the full registered address if the rules for your business require it (docs/POLICIES.md).
export const BUSINESS = Object.freeze({ legalName: 'InviteStudio', address: 'Kochi, Kerala, India' });

// Same details as site-config.js (the browser's copy); tests/unit/policies.test.mjs fails if they differ.
export const CONTACT = Object.freeze({ email: 'abinalyas@gmail.com', whatsapp: '919567882568' });
// The same address as site-config.js (tests/unit/footers.test.mjs keeps them equal).
export const SOCIAL = Object.freeze({ instagram: 'https://www.instagram.com/invite__studio.co/' });

export const POLICIES = Object.freeze([
  {
    slug: 'terms',
    title: 'Terms of use — InviteStudio',
    description: 'The terms for using InviteStudio to build and publish a wedding invitation website: what you get, what you pay, and what we each agree to.',
    h1: 'Terms of use',
    sections: [
      { h2: 'What InviteStudio is', p: ['InviteStudio lets you build a wedding invitation website from a template, preview it privately, publish it at its own InviteStudio link and collect replies (RSVPs) from your guests. These terms apply when you use the site, build a draft or publish an invitation.'] },
      { h2: 'Your draft and your private link', p: ['You do not need an account. Each draft has a private editing link. Anyone who has that link can change the draft, so keep it safe. If you lose it we may not be able to recover the draft for you.'] },
      { h2: 'Price and payment', p: ['Building and previewing is free. You pay once, when you publish, and the price depends on the design you choose and where you are. The price is shown before you pay, in your currency, and there is no subscription. While publishing is free during early access, nothing is charged.', 'Payments are taken by Razorpay on its own page. We never see or store your card or UPI details. Refunds are covered by the Refund policy.'] },
      { h2: 'How long your invitation stays online', p: ['A published invitation stays online at least until 2 months after your last event date. The plan is to close invitations after that, and no later than 8 months after they were first published, but closing is not switched on yet. The editor shows when your invitation is due to close and warns you 14 days before. To keep it longer, or to bring a closed one back, contact us.'], },
      { h2: 'Your content', p: ['You keep ownership of the names, words, photos and other things you put into your invitation. You give us permission to store them and show them to the people you share the link with, for as long as the invitation is kept. You promise that you have the right to use what you upload, and that it does not break the law, infringe anyone’s rights, or harass or deceive anyone.', 'We may close an invitation that breaks these terms. Where we can, we tell you first.'] },
      { h2: 'Guest replies', p: ['When guests reply, you decide what to do with their details. Please use them only to organise your event. Replies are deleted with the rest of your invitation as described in the Privacy policy.'] },
      { h2: 'Our templates and designs', p: ['The templates, artwork, animations, layouts and code on InviteStudio belong to InviteStudio and are protected by copyright. When you build an invitation you may use the template you chose for that invitation, at its InviteStudio link, for your own event.', 'You may not:'], list: [
        'copy, download or extract a template’s files, code or artwork;',
        'host, resell, share or republish a template, or any part of it, anywhere outside InviteStudio;',
        'use automated tools to collect or scrape our templates;',
        'remove copyright notices or the markings in our templates; or',
        'use our templates to build a competing template library or service.'
      ] },
      { h2: 'Copies of our templates', p: ['If a template is copied without permission, we may ask the website or host that shows it to remove it, and we may close the invitation of anyone who breaks these rules. Your own words, photos and details stay yours: this section is about our designs. To report a copy, see the Contact page.'] },
      { h2: 'Availability and changes', p: ['We work to keep InviteStudio available, but we cannot promise it will never be interrupted or free of errors. We may change or improve the site and its templates. If we change these terms we will update the date on this page.'] },
      { h2: 'Responsibility', p: ['We are responsible for providing the service as described here. We are not responsible for losses that we could not reasonably have foreseen, or that come from something outside our control, such as your guests’ devices or internet. Nothing here limits any right you have by law.'] },
      { h2: 'Questions', p: ['Contact us on the Contact page.'] }
    ]
  },
  {
    slug: 'refund-policy',
    title: 'Refund policy — InviteStudio',
    description: 'When you can get your money back for a published InviteStudio invitation, how to ask, and how long a refund takes.',
    h1: 'Refund policy',
    sections: [
      { h2: 'Try it free first', p: ['You can build and preview your invitation for free, so you only pay once you have seen exactly what you are getting.'] },
      { h2: 'When you can get a refund', list: [
        'If something went wrong on our side, for example you paid and could not publish, or the invitation did not work as described, we refund you in full.',
        `If you change your mind, you can ask for a full refund within ${REFUND_DAYS} days of paying.`,
        'If you were charged twice for the same invitation, we refund the extra payment.'
      ] },
      { h2: 'What happens to your invitation', p: ['When a payment is refunded, we may take the invitation offline. If you want to keep it online, tell us when you ask.'] },
      { h2: 'How to ask', p: ['Contact us on the Contact page with the email or phone number you paid with, and the date of payment. We reply as soon as we can.'] },
      { h2: 'How long it takes', p: ['We refund to the same payment method you used, through Razorpay. After we approve a refund it usually reaches you within 5 to 10 business days, depending on your bank or card issuer.'] },
      { h2: 'Prices and currency', p: ['You are refunded the amount you paid, in the currency you paid in. Your bank may apply its own exchange rate or fees, which we cannot refund.'] }
    ]
  },
  {
    slug: 'delivery-policy',
    title: 'Delivery policy — InviteStudio',
    description: 'How and when your InviteStudio invitation is delivered: a digital service, online as soon as you publish. Nothing is shipped.',
    h1: 'Delivery policy',
    updated: '20 November 2026',
    sections: [
      { h2: 'What we deliver', p: ['InviteStudio is a digital service. We do not sell or ship physical goods, so nothing is posted or couriered to you and no delivery address is needed. What you receive is your published wedding invitation website, online.'] },
      { h2: 'When you get it', p: ['You can build and preview your invitation for free. Once your payment is confirmed you can make it live straight away, and your invitation is available at its own InviteStudio link as soon as you publish.', 'Confirming a payment usually takes under a minute. A bank is sometimes slower: the page keeps checking and you can press Check again. If you have paid and still cannot publish, contact us and we will sort it out.'] },
      { h2: 'What you receive', list: [
        'A public link to your invitation, to share on WhatsApp, text or email.',
        'Your private editing link, so you can change your invitation whenever you like.',
        'Guest replies (RSVPs), collected in your editor and available to download as a spreadsheet.',
        'A share card picture with a ready-written message for WhatsApp.'
      ] },
      { h2: 'Where it is available', p: ['Your invitation is delivered online, so it can be opened anywhere with an internet connection. There are no shipping charges.'] },
      { h2: 'How long it stays online', p: ['A published invitation stays online at least until 2 months after your last event date. The Terms of use give the full details.'] },
      { h2: 'Custom designs', p: ['A custom design is agreed with you one to one, including its price and when it will be ready, before you pay. Ask on the Contact page.'] },
      { h2: 'If something goes wrong', p: ['If your invitation is not delivered as described, we put it right or refund you. See the Refund policy, or contact us on the Contact page.'] }
    ]
  },
  {
    slug: 'privacy',
    title: 'Privacy policy — InviteStudio',
    description: 'What InviteStudio stores about you and your guests, who processes it, how long it is kept and how to ask us to delete it.',
    h1: 'Privacy policy',
    sections: [
      { h2: 'What we store', p: ['This is what InviteStudio keeps when you use it:'], list: [
        'Your invitation: names, dates, venues, story, photos and the other details you enter, and the web address you choose.',
        'Your private editing link, which is the key to your draft.',
        'Guest replies (RSVPs): the guest’s name, whether they are coming, how many people, any meal or access needs and an optional message. Guests are asked for nothing else.',
        'Payment records: the amount, currency, status and Razorpay’s reference for each payment. Card and UPI details go to Razorpay and never reach us.',
        'Your contact details, when you pay: your name, your email address and, if you choose to give it, a phone or WhatsApp number. We ask for them once, before the payment page, for your receipt and to help you if you lose your private link. We pass them to Razorpay so its page is already filled in. If you tick the box, we may also send you tips and reminders about your invitation; if you do not, we will not. They are kept apart from your invitation and are never shown on it.',
        'The country your visit comes from, which is used only to show the price for your region.',
        'Session recordings on our public pages: on the home page, the templates and design pages and our guides, and only for visitors outside the European Economic Area, the United Kingdom and Switzerland, we may record how a visit uses the page (clicks, taps, scrolling and what is shown) with Microsoft Clarity, to find what confuses people. We never record the setup steps, the editor, previews, the dashboard, any dialog or an invitation, and we do not record visitors whose browser sends “Do Not Track” or “Global Privacy Control”. Recordings are processed by Microsoft (see Who handles it for us).',
        'Anonymous visit statistics: for each page view we keep the page (never a private link), the site you came from, your country, the kind of device, browser and system you use, your screen width and your language. We do not use cookies for this and we do not store your IP address or your browser’s identifying text. To count visitors we keep a hash of your IP address and browser that changes every day, so it can tell how many people visited in a day but cannot follow you from one day to the next or be turned back into an address. We do not count visitors whose browser sends “Do Not Track” or “Global Privacy Control”. These statistics are deleted after 400 days.'
      ] },
      { h2: 'What we do not do', p: ['We do not use advertising or tracking cookies, and we do not sell personal information. Your draft is also kept in your own browser, as a backup so you can continue.'] },
      { h2: 'Who handles it for us', p: ['We use a small number of services to run InviteStudio: Cloudflare (hosting and photo storage), Supabase (the database), Razorpay (payments), Microsoft Clarity (session recordings of our public pages, described above) and Google Fonts (the site’s typefaces, which your browser loads from Google). Each handles data only to provide that service.'] },
      { h2: 'How long we keep it', p: ['An invitation, its guest replies, photos and private links are kept at least until 2 months after your last event date. The plan is to close invitations after that (no later than 8 months after they were first published) and then delete their data for good. That automatic clean-up is not switched on yet, so until it is, we keep the data. You can ask us to delete yours at any time by contacting us, and we will do it. A draft that was never published is kept until you or we remove it, and you can ask us to remove it sooner. Payment records are kept for as long as the law requires us to keep accounts.'] },
      { h2: 'Your choices', p: ['You can download your guest replies as a spreadsheet and delete individual replies in the editor. You can ask us to delete your invitation, its replies and your contact details at any time, or to tell you what we hold, by contacting us. If you are a guest and want your reply removed, contact the couple, or contact us and we will help.'] },
      { h2: 'Your guests', p: ['The couple decides what to do with the replies they receive. Please use guests’ details only to organise your event.'] },
      { h2: 'Changes', p: ['If we change this policy we will update the date on this page.'] }
    ]
  },
  {
    slug: 'contact',
    title: 'Contact InviteStudio',
    description: 'Contact InviteStudio by email or WhatsApp for questions, refunds, keeping your invitation online longer, or a custom design.',
    h1: 'Contact us',
    contact: true,
    sections: [
      { h2: 'What to contact us about', list: [
        'A question about InviteStudio or your invitation',
        'A refund or a payment problem (see the Refund policy)',
        'Keeping your invitation online for longer, or bringing a closed one back',
        'A custom design made just for you',
        'Deleting your invitation and its replies, or what we hold about you',
        'Reporting a copy of an InviteStudio template on another website'
      ] },
      { h2: 'Report a copy of our templates', p: ['If you see an InviteStudio template or design on another website, or for sale somewhere else, please send us the web address of the copy and a few words about where you found it. We take copyright seriously and will ask the host to remove it.'] }
    ]
  }
]);

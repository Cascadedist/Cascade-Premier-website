import nodemailer from 'nodemailer';

const recipient = 'cascadepremierdist@gmail.com';
const inquiryTypes = new Set([
  'Supplier or distributor partnership',
  'Wholesale account opportunity',
  'Price file / product quote',
  'General business inquiry',
]);
const areas = new Set([
  'General merchandise',
  'Health & beauty',
  'Home & lifestyle',
  'Food & beverage',
  'Electronics & accessories',
  'Other (describe in message)',
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function text(value, maxLength) {
  return String(value ?? '').trim().replace(/[\u0000-\u001f\u007f]/g, '').slice(0, maxLength);
}

export default {
  async fetch(request) {
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

    const appPassword = process.env.GMAIL_APP_PASSWORD;
    if (!appPassword) return json({ error: 'The inquiry form is temporarily unavailable. Please email cascadepremierdist@gmail.com.' }, 503);

    let data;
    try {
      const raw = await request.text();
      if (raw.length > 16_000) return json({ error: 'The inquiry is too long.' }, 413);
      data = JSON.parse(raw);
    } catch {
      return json({ error: 'Please check the form and try again.' }, 400);
    }

    // Silent success for the hidden anti-spam field.
    if (text(data.fax, 100)) return json({ ok: true });

    const inquiry = {
      firstName: text(data.firstName, 100),
      lastName: text(data.lastName, 100),
      company: text(data.company, 200),
      email: text(data.email, 254),
      phone: text(data.phone, 60),
      website: text(data.website, 500),
      inquiryType: text(data.inquiryType, 100),
      areaOfInterest: text(data.areaOfInterest, 150),
      message: text(data.message, 5000),
    };

    if (Object.entries(inquiry).some(([key, value]) => key !== 'phone' && !value)) {
      return json({ error: 'Please complete all required fields.' }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email)) {
      return json({ error: 'Please enter a valid email address.' }, 400);
    }
    if (!inquiryTypes.has(inquiry.inquiryType) || !areas.has(inquiry.areaOfInterest)) {
      return json({ error: 'Please select an inquiry type and area of interest.' }, 400);
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        user: recipient,
        pass: appPassword.replace(/\s/g, ''),
      },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    const message = [
      `Name: ${inquiry.firstName} ${inquiry.lastName}`,
      `Company: ${inquiry.company}`,
      `Email: ${inquiry.email}`,
      `Phone: ${inquiry.phone || 'Not provided'}`,
      `Company website: ${inquiry.website}`,
      `Inquiry type: ${inquiry.inquiryType}`,
      `Area of interest: ${inquiry.areaOfInterest}`,
      '',
      inquiry.message,
    ].join('\n');

    try {
      await transporter.sendMail({
        from: `Cascade Premier <${recipient}>`,
        to: recipient,
        replyTo: inquiry.email,
        subject: `Website inquiry: ${inquiry.inquiryType}`,
        text: message,
      });
      return json({ ok: true });
    } catch (error) {
      console.error('Inquiry email could not be sent:', error.message);
      return json({ error: 'We could not send your inquiry right now. Please email cascadepremierdist@gmail.com or call (509) 707-2249.' }, 502);
    }
  },
};

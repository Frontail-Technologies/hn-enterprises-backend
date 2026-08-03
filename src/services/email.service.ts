import { EMAIL_FROM, EMAIL_PROVIDER, NODE_ENV, RESEND_API_KEY } from "@constants";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

async function sendWithResend(input: SendEmailInput) {
  if (!RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required for resend email provider");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "Unknown email provider error");
    throw new Error(`Unable to send email: ${message}`);
  }
}

export const emailService = {
  async send(input: SendEmailInput) {
    if (EMAIL_PROVIDER === "resend") {
      await sendWithResend(input);
      return;
    }

    if (NODE_ENV !== "production") {
      console.info("[email:console]", {
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
    }
  },

  async sendPasswordResetOtp({ email, name, otp, expiresInMinutes }: { email: string; name: string; otp: string; expiresInMinutes: number }) {
    await this.send({
      to: email,
      subject: "HN Enterprises password reset OTP",
      text: `Hello ${name}, your HN Enterprises password reset OTP is ${otp}. It expires in ${expiresInMinutes} minutes.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
          <p>Hello ${name},</p>
          <p>Your HN Enterprises password reset OTP is:</p>
          <p style="font-size:24px;font-weight:700;letter-spacing:4px">${otp}</p>
          <p>This OTP expires in ${expiresInMinutes} minutes.</p>
          <p>If you did not request this, ignore this email.</p>
        </div>
      `,
    });
  },
};

import { Resend } from "resend";

export async function POST({ request, redirect }) {
  try {
    const formData = await request.formData();

    const name = formData.get("name")?.toString().trim();
    const email = formData.get("email")?.toString().trim();
    const date = formData.get("date")?.toString().trim();
    const location = formData.get("location")?.toString().trim();
    const type = formData.get("type")?.toString().trim();
    const message = formData.get("message")?.toString().trim();

    if (!name || !email) {
      return new Response(
        "Please provide your name and email address.",
        {
          status: 400,
          headers: {
            "Content-Type": "text/plain",
          },
        }
      );
    }

    const resend = new Resend(import.meta.env.RESEND_API_KEY);

    const { error } = await resend.emails.send({
      from: "Julie Han Photography <inquiry@juliehanphotography.com>",
      to: ["julie@juliehanphotography.com"],
      replyTo: email,
      subject: `New photography inquiry from ${name}`,
      text: `
Name: ${name}
Email: ${email}
Event date: ${date || "Not provided"}
Location: ${location || "Not provided"}
Type: ${type || "Not provided"}

Message:
${message || "No message provided"}
      `.trim(),
    });

    if (error) {
      console.error(error);

      return new Response(
        "Something went wrong. Please try again.",
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain",
          },
        }
      );
    }

    return redirect("/contact?success=true", 303);
  } catch (error) {
    console.error(error);

    return new Response(
      "Something went wrong. Please try again.",
      {
        status: 500,
        headers: {
          "Content-Type": "text/plain",
        },
      }
    );
  }
}
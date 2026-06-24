import "./globals.css";

export const metadata = {
  title: "MRKT Autobuyer",
  description: "Telegram Mini App MVP for gift monitoring"
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>
        {children}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </body>
    </html>
  );
}

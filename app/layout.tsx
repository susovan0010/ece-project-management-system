import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ECE Capstone Project Management System | HITK',
  description:
    'Department of Electronics and Communication Engineering, Heritage Institute of Technology Kolkata. NBA accreditation and Washington Accord outcome-based project evaluation platform.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen font-sans bg-slate-50 text-slate-900 antialiased selection:bg-blue-600 selection:text-white">
        {children}
      </body>
    </html>
  );
}

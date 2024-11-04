"use client";

import Link from 'next/link';

export default function TermsOfService() {
  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Terms of Service</h1>
      
      <div className="prose prose-slate max-w-none">
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
          <p className="mb-4">
            By accessing and using RedZwitch ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
          <p className="mb-4">
            RedZwitch is a Redis migration tool that facilitates the transfer of data between Redis instances. The Service provides real-time monitoring, synchronization, and management of Redis database migrations.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. User Responsibilities</h2>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">You are responsible for maintaining the security of your Redis instances</li>
            <li className="mb-2">You must ensure you have the necessary rights to access and modify the Redis instances</li>
            <li className="mb-2">You agree not to use the Service for any illegal purposes</li>
            <li className="mb-2">You are responsible for any data loss or corruption that may occur during migration</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Data Privacy</h2>
          <p className="mb-4">
            RedZwitch does not store any Redis data on its servers. We only process data in transit during migration. For more information about how we handle your data, please see our{' '}
            <Link href="/privacy" className="text-blue-600 hover:underline">
              Privacy Policy
            </Link>.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Limitations of Liability</h2>
          <p className="mb-4">
            The Service is provided "as is" without any warranties. We are not responsible for any data loss, corruption, or damages arising from the use of our Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Changes to Terms</h2>
          <p className="mb-4">
            We reserve the right to modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Contact</h2>
          <p className="mb-4">
            If you have any questions about these Terms, please contact us at support@redzwitch.com
          </p>
        </section>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        Last updated: {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}
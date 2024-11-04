"use client";

import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <div className="container mx-auto p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-8">Privacy Policy</h1>
      
      <div className="prose prose-slate max-w-none">
        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">1. Data Collection and Usage</h2>
          <p className="mb-4">
            RedZwitch is committed to protecting your privacy. We only collect and process the minimum amount of data necessary to provide our Redis migration service.
          </p>
          <h3 className="text-xl font-semibold mb-3">Data We Collect:</h3>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">Redis connection details (host, port)</li>
            <li className="mb-2">Migration statistics (progress, speed, completion status)</li>
            <li className="mb-2">Error logs related to migration processes</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">2. Redis Data Processing</h2>
          <p className="mb-4">
            RedZwitch operates as a transit service only. We do not store, cache, or retain any Redis data that passes through our service during migration. All data transfer occurs directly between your source and target Redis instances.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">3. Data Security</h2>
          <p className="mb-4">
            We implement several security measures to protect your data:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">TLS encryption for all data transfers</li>
            <li className="mb-2">Secure handling of Redis authentication credentials</li>
            <li className="mb-2">No persistent storage of Redis data</li>
            <li className="mb-2">Regular security audits and updates</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">4. Analytics and Cookies</h2>
          <p className="mb-4">
            We use minimal analytics to improve our service. This includes:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">Basic usage statistics</li>
            <li className="mb-2">Performance metrics</li>
            <li className="mb-2">Error tracking</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">5. Third-Party Services</h2>
          <p className="mb-4">
            We use Supabase for storing migration logs and statistics. Please refer to their privacy policy for more information about how they handle data.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">6. Your Rights</h2>
          <p className="mb-4">
            You have the right to:
          </p>
          <ul className="list-disc pl-6 mb-4">
            <li className="mb-2">Access your migration logs</li>
            <li className="mb-2">Request deletion of your migration history</li>
            <li className="mb-2">Opt-out of analytics</li>
          </ul>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">7. Changes to Privacy Policy</h2>
          <p className="mb-4">
            We may update this privacy policy from time to time. We will notify users of any material changes via email or through the Service.
          </p>
        </section>

        <section className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">8. Contact Us</h2>
          <p className="mb-4">
            If you have any questions about this Privacy Policy, please contact us at privacy@redzwitch.com
          </p>
        </section>
      </div>

      <div className="mt-8 text-sm text-gray-600">
        Last updated: {new Date().toLocaleDateString()}
      </div>
      
      <div className="mt-4">
        <Link href="/terms" className="text-blue-600 hover:underline">
          View Terms of Service
        </Link>
      </div>
    </div>
  );
}
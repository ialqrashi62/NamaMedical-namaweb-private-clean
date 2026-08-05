'use strict';
// GEO — Generative Engine Optimization. Structured data for AI citations.
// Outputs JSON-LD blocks for MedicalOrganization, Hospital, FAQPage, HowTo.

class GEO {
  medicalOrganization({ name, url, logo, sameAs }) {
    return {
      '@context': 'https://schema.org',
      '@type': 'MedicalOrganization',
      name,
      url,
      logo,
      sameAs,
      description: 'NamaMedical Hospital Enterprise Platform',
    };
  }

  hospital({ name, url, address, telephone, openingHours }) {
    return {
      '@context': 'https://schema.org',
      '@type': 'Hospital',
      name,
      url,
      address,
      telephone,
      openingHours,
    };
  }

  faqPage({ qa }) {
    return {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: qa.map((q) => ({
        '@type': 'Question',
        name: q.q,
        acceptedAnswer: { '@type': 'Answer', text: q.a },
      })),
    };
  }

  howTo({ name, steps }) {
    return {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name,
      step: steps.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, text: s })),
    };
  }

  render({ type, data }) {
    return `<script type="application/ld+json">${JSON.stringify(this[type](data))}</script>`;
  }
}

module.exports = { GEO };

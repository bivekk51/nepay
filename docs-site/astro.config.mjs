// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://unified-nepal-payments.dev',
	integrations: [
		starlight({
			title: 'Unified Nepal Payments',
			description: 'Unified server-side TypeScript SDK for Nepal payment gateways (eSewa & Khalti).',
			customCss: ['./src/styles/custom.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/bivekk51/nepal-payment-sdk' }
			],
			editLink: {
				baseUrl: 'https://github.com/bivekk51/nepal-payment-sdk/edit/main/docs-site/',
			},
			sidebar: [
				{
					label: 'Start Here',
					items: [
						{ label: 'Overview', slug: 'index' },
						{ label: 'Installation', slug: 'getting-started/installation' },
						{ label: 'Quick Start', slug: 'getting-started/quickstart' },
					],
				},
				{
					label: 'Core Concepts',
					items: [
						{ label: 'Integer Paisa & Money Math', slug: 'concepts/money-paisa' },
						{ label: 'Security & Server-Only Keys', slug: 'concepts/security' },
						{ label: 'S2S Verification & Contracts', slug: 'concepts/verification' },
					],
				},
				{
					label: 'Supported Gateways',
					items: [
						{ label: 'eSewa (ePay v2)', slug: 'gateways/esewa' },
						{ label: 'Khalti (ePayment v2)', slug: 'gateways/khalti' },
						{ label: 'FonePay (Roadmap)', slug: 'gateways/fonepay' },
					],
				},
				{
					label: 'Framework Recipes',
					items: [
						{ label: 'Express.js Integration', slug: 'recipes/express' },
						{ label: 'Next.js Server Actions', slug: 'recipes/nextjs' },
					],
				},
				{
					label: 'Guides & Sandbox',
					items: [
						{ label: 'Testing & Sandbox Credentials', slug: 'guides/sandbox-testing' },
						{ label: 'FAQ & Troubleshooting', slug: 'guides/faq' },
					],
				},
				{
					label: 'API Reference',
					items: [
						{ label: 'Functions & Methods', slug: 'reference/api' },
						{ label: 'TypeScript Types & Schemas', slug: 'reference/types' },
					],
				},
			],
		}),
	],
});

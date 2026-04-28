import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PaypalService, Product } from '../../servicio/paypal.service';

declare global {
	interface Window {
		paypal?: {
			Buttons: (config: {
				createOrder: () => Promise<string>;
				onApprove: (data: { orderID: string }) => Promise<void>;
				onError: (error: unknown) => void;
			}) => { render: (selector: string) => Promise<void> };
		};
	}
}

@Component({
	selector: 'app-checkout',
	imports: [CommonModule],
	templateUrl: './check.co.html',
	styleUrl: './check.co.css'
})
export class CheckoutComponent implements OnInit {
	private readonly paypalService = inject(PaypalService);
	private readonly maxInitialLoadMs = 10000;

	readonly products = signal<Product[]>([]);
	readonly selectedProduct = signal<Product | null>(null);
	readonly loading = signal(true);
	readonly statusMessage = signal('Selecciona un producto para continuar con PayPal.');
	readonly statusType = signal<'info' | 'success' | 'error'>('info');
	readonly debugMessage = signal('Esperando carga inicial de productos...');
	private paypalReady = false;

	async ngOnInit(): Promise<void> {
		const watchdog = setTimeout(() => {
			if (!this.loading()) {
				return;
			}
			this.loading.set(false);
			this.statusType.set('error');
			this.statusMessage.set('La carga inicial excedio el tiempo limite. Revisa backend/API y recarga.');
			this.debugMessage.set('Watchdog activo: la peticion inicial no finalizo a tiempo.');
		}, this.maxInitialLoadMs);

		try {
			const products = await firstValueFrom(this.paypalService.getProducts());
			this.products.set(products);
			this.statusMessage.set('Productos cargados desde la base de datos tienda.');
			this.statusType.set('info');
			this.debugMessage.set(`Productos recibidos: ${products.length}`);
		} catch (error) {
			this.statusMessage.set('No fue posible cargar productos. Verifica que backend (3000) y MariaDB esten activos.');
			this.statusType.set('error');
			this.debugMessage.set(error instanceof Error ? error.message : 'Error desconocido al consultar productos');
			console.error(error);
		} finally {
			clearTimeout(watchdog);
			this.loading.set(false);
		}
	}

	async selectProduct(product: Product): Promise<void> {
		this.selectedProduct.set(product);
		this.statusMessage.set(`Producto seleccionado: ${product.name}. Completa el pago en PayPal Sandbox.`);
		this.statusType.set('info');

		try {
			if (!this.paypalReady) {
				const { clientId } = await firstValueFrom(this.paypalService.getClientId());
				await this.loadPaypalScript(clientId);
				this.paypalReady = true;
			}
			await this.renderButtons();
		} catch (error) {
			this.statusMessage.set('No se pudo iniciar PayPal SDK.');
			this.statusType.set('error');
			console.error(error);
		}
	}

	private async renderButtons(): Promise<void> {
		const selectedProduct = this.selectedProduct();
		if (!window.paypal || !selectedProduct) {
			return;
		}

		const container = document.getElementById('paypal-button-container');
		if (!container) {
			return;
		}
		container.innerHTML = '';

		await window.paypal.Buttons({
			createOrder: async () => {
				const currentProduct = this.selectedProduct();
				if (!currentProduct) {
					throw new Error('No hay producto seleccionado');
				}
				const order = await firstValueFrom(this.paypalService.createOrder(currentProduct.id));
				return order.id;
			},
			onApprove: async (data: { orderID: string }) => {
				const capture = await firstValueFrom(this.paypalService.captureOrder(data.orderID));
				this.statusMessage.set(`Pago completado. Orden ${data.orderID} capturada en sandbox.`);
				this.statusType.set('success');
				console.log('PayPal capture', capture);
			},
			onError: (error: unknown) => {
				this.statusMessage.set('Ocurrió un error al procesar el pago con PayPal.');
				this.statusType.set('error');
				console.error(error);
			}
		}).render('#paypal-button-container');
	}

	private loadPaypalScript(clientId: string): Promise<void> {
		const sdkUrl = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(clientId)}&currency=MXN&intent=capture&components=buttons&locale=es_MX`;
		const existing = document.querySelector<HTMLScriptElement>('script[data-paypal-sdk="true"]');
		if (existing && existing.src === sdkUrl) {
			return Promise.resolve();
		}

		if (existing) {
			existing.remove();
			delete window.paypal;
		}

		return new Promise((resolve, reject) => {
			const script = document.createElement('script');
			script.src = sdkUrl;
			script.async = true;
			script.dataset['paypalSdk'] = 'true';
			script.onload = () => resolve();
			script.onerror = () => reject(new Error('No se pudo cargar el SDK de PayPal'));
			document.body.appendChild(script);
		});
	}
}

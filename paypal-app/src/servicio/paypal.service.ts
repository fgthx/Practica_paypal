import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

export interface Product {
	id: number;
	name: string;
	description: string;
	price: number;
	stock: number;
	currency: string;
}

export interface CreateOrderResponse {
	id: string;
	status: string;
	product: Product;
}

@Injectable({ providedIn: 'root' })
export class PaypalService {
	private readonly http = inject(HttpClient);
	private readonly baseUrl = 'http://localhost:3000/api';
	private readonly requestTimeoutMs = 8000;

	getProducts(): Observable<Product[]> {
		return this.http
			.get<Product[]>(`${this.baseUrl}/products`)
			.pipe(timeout(this.requestTimeoutMs));
	}

	getClientId(): Observable<{ clientId: string }> {
		return this.http
			.get<{ clientId: string }>(`${this.baseUrl}/paypal/client-id`)
			.pipe(timeout(this.requestTimeoutMs));
	}

	createOrder(productId: number): Observable<CreateOrderResponse> {
		return this.http
			.post<CreateOrderResponse>(`${this.baseUrl}/orders`, { productId })
			.pipe(timeout(this.requestTimeoutMs));
	}

	captureOrder(orderId: string): Observable<unknown> {
		return this.http
			.post(`${this.baseUrl}/orders/${orderId}/capture`, {})
			.pipe(timeout(this.requestTimeoutMs));
	}
}

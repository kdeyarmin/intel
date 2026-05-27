ALTER TABLE "provider_service_utilization" ADD COLUMN "hcpcs_code" varchar(20);--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN "hcpcs_description" text;--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN "place_of_service" varchar(10);--> statement-breakpoint
ALTER TABLE "provider_service_utilization" ADD COLUMN "average_medicare_payment_amt" varchar(50);
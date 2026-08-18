# New City Furniture Website

This is a working preview of a modern website for New City Furniture.

It is built so visitors can browse furniture, view product details, add items to a cart, and prepare for checkout. It also includes an admin area for editing products, categories, orders, website details, delivery settings, payment setup, and content status.

## What This Website Can Do

- Show a premium homepage for New City Furniture.
- Show the real public business details for The New City Furniture Company Limited.
- Let visitors browse furniture by category.
- Let visitors search and filter products.
- Show product prices in Jamaican dollars, or show “Request price” when the real price still needs to be added.
- Let visitors add items to a cart.
- Save checkout requests as real orders in the database.
- Show a protected admin dashboard.
- Let the admin edit the main website information from simple dashboard tabs.
- Let the admin add or update products and categories without editing code.
- Let the admin upload product photos.
- Let the admin update order status, delivery zones, payment providers, and content blocks from one admin area.
- Store website information in an easy local database.
- Prepare the site for Jamaican payment options such as WiPay, Fygaro, NCB e-commerce, Lynk, or another approved payment provider.

## How to Open the Website

1. Open the project folder.
2. Start the website with this command:

```bash
python3 run.py
```

3. Open this address in a browser:

```text
http://127.0.0.1:4173
```

If that address is already being used, you can start it on another number:

```bash
PORT=4174 python3 run.py
```

Then open:

```text
http://127.0.0.1:4174
```

Important: open the website using the `http://127.0.0.1` address. Do not open the `index.html` file directly, because the cart, checkout, and admin features need the website server to be running.

## Production Setup

For a real public server, do these before starting the website:

1. Copy `.env.example` to `.env`.
2. Put in the real website address.
3. Set a strong private password for Richie.
4. Choose where the database file should be stored.
5. Start the website through the hosting company or server.

The most important settings are:

```text
NEW_CITY_ENV=production
NEW_CITY_ALLOWED_ORIGINS=https://www.newcityfurniture.com
NEW_CITY_RICHIE_PASSWORD=your-strong-private-password
NEW_CITY_DB=/app/data/new_city.sqlite3
PORT=8000
```

Do not use `Password: Richie` on a public website.

To change the admin password, run:

```bash
python3 change_admin_password.py
```

Use at least 12 characters for the new password.

## Main Pages

- Home: `/`
- Catalog: `/catalog`
- Living Room: `/category/living-room`
- Product Example: `/product/solid-wood-sofa-set`
- Cart: `/cart`
- Checkout: `/checkout`
- Admin: `/admin`
- Contact: `/contact`

## Admin Login

Go to:

```text
/admin
```

For this preview, use this login:

```text
Username: Richie
Password: Richie
```

This is only for local testing. Before the real website goes live, the password should be changed to a strong private password.

## Easy Database

The website now uses a simple database file.

The file is created automatically when the website starts:

```text
new_city.sqlite3
```

This database is used for:

- Products
- Categories
- Orders
- Website settings
- Delivery areas
- Payment provider setup
- Admin users
- Website content blocks
- Uploaded product photos

This means the admin area can manage the main parts of the business without editing code.

## Backend Management

The backend is ready to manage:

- Website details
- Products
- Categories
- Orders
- Delivery zones
- Payment provider setup
- Admin login sessions

The admin screen can now sign in, use tabs, open only the item being edited, and save changes back to the database.

Product photos can be uploaded from the product editor. Uploaded photos are saved inside:

```text
frontend/assets/uploads
```

When a visitor submits checkout, the request is saved as an order and appears in the admin Orders tab.

## Security Already Added

The preview now includes basic security protections, including:

- Protection against the site being loaded inside another website.
- Protection against some common browser attacks.
- Safer handling of product and admin text.
- Admin information is marked so browsers should not store it.
- The admin password is hidden while typing.
- The admin login session is only saved for the current browser tab session.
- Checkout information is checked before totals are calculated.
- Admin passwords are stored as protected password hashes, not plain text.

## Business Information Already Added

The site has been filled with public business information found online:

- Business name: The New City Furniture Company Limited
- Main phone: +1 876 948 5654
- Branch phone found online: +1 876 918 0251
- Email: thenewcityfurniture@gmail.com
- Main address: 20 Orange Street, Kingston, Jamaica
- Branch address found online: Shop 3, Hendon Mall, Savanna-la-Mar, Westmoreland
- Website found online: https://www.thenewcityfurnitureja.com
- Product lines found online: Pure Comfort mattresses, living room suites, dressers, wardrobes, bed bases, headboards, bar stools, and lounge chairs

Some public websites show slightly different opening hours and website links. Before the site goes live, the owner should confirm the final hours, website address, branch details, prices, and product photos.

## Before This Goes Live

Before customers use this website for real, these items should be completed:

- Confirm the New City Furniture phone, WhatsApp, email, address, branch details, and opening hours.
- Replace sample product photos with real product photos.
- Add final prices and stock numbers for products currently marked “Request price”.
- Add real staff accounts and change the preview password.
- Connect the chosen online payment provider.
- Add real delivery prices and rules for Jamaica.
- Add real terms, privacy policy, return policy, and delivery policy.
- Add backups, monitoring, and regular security updates.
- Test the site on phones, tablets, and desktop screens.

## Backups

To make a copy of the database, run:

```bash
python3 backup_database.py
```

This saves a copy inside the `backups` folder.

## Folder Guide

- `frontend` is what visitors and admins see in the browser.
- `backend` handles the website data, database, checkout preview, and admin protection.
- `run.py` starts the website.
- `new_city.sqlite3` is the local database file created by the website.
- `frontend/assets/uploads` stores uploaded product photos.
- `.env.example` shows the settings needed on a public server.
- `Dockerfile` is for hosting the website in a container.
- `backup_database.py` makes a backup copy of the database.
- `change_admin_password.py` changes the admin password.

## Current Status

This is now a stronger production-ready foundation, but it still needs real business information, real photos, a real payment provider, and final hosting setup before customers use it.

It is ready for review, design feedback, product updates, admin editing screens, and hosting setup.

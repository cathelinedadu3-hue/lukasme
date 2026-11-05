import { test,expect } from '@playwright/test';
async function navigate(page:any,name:string,isMobile:boolean){if(isMobile)await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name,exact:true}).click();}
test('fresh dashboard contains no invented financial data',async({page})=>{await page.goto('/');await expect(page.getByRole('heading',{name:'Your next chapter starts here.'})).toBeVisible();await expect(page.getByText('Your transactions start here')).toBeVisible();await expect(page.locator('.stat-value')).toHaveCount(4);for(const item of await page.locator('.stat-value').all())await expect(item).toHaveText('TZS—');});
test('service outage is explicitly labelled',async({page})=>{await page.route('**/api/connection',route=>route.fulfill({json:{configured:false,database:false,authentication:true}}));await page.goto('/');await expect(page.getByText('Service unavailable',{exact:true})).toBeVisible();await page.getByRole('button',{name:'View setup',exact:true}).click();await expect(page.getByRole('heading',{name:'Business settings',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Check Netlify services',exact:true})).toBeVisible();});
test('theme changes without losing navigation',async({page,isMobile})=>{await page.goto('/');await page.getByRole('button',{name:'Switch to dark theme'}).click();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await page.reload();await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await navigate(page,'Inventory & products',isMobile);await expect(page.getByRole('heading',{name:'Inventory & products'})).toBeVisible();});
test('record action opens real authentication flow with focus management',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Record a sale',exact:true}).first().click();const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog.getByRole('heading',{name:'Welcome to your workspace.'})).toBeVisible();await dialog.getByRole('button',{name:'Create an account'}).click();await expect(dialog.getByLabel('Your name')).toBeVisible();await page.keyboard.press('Escape');await expect(dialog).not.toBeVisible();});
test('tax rules start unconfigured and explain official filing boundary',async({page,isMobile})=>{await page.goto('/');await navigate(page,'Tax & compliance',isMobile);await expect(page.getByText('HORIZON does not submit official tax returns.',{exact:false})).toBeVisible();await page.getByRole('button',{name:'Rule versions',exact:false}).first().click();await expect(page.getByRole('heading',{name:'No tax rates are assumed'})).toBeVisible();});
test('each main module navigates on desktop and mobile',async({page,isMobile})=>{await page.goto('/');for(const name of ['Sales & invoices','Customers','Suppliers','Purchases','Expenses','Cash & bank','Financial reports','Employees & payroll','Team & permissions','Activity log']){await navigate(page,name,isMobile);await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();}await expect(page.locator('body')).toHaveJSProperty('scrollWidth',await page.evaluate(()=>document.documentElement.clientWidth));});

test('unconfirmed email offers confirmation resend instead of a raw login error',async({page})=>{
 await page.route('**/.netlify/identity/token*',route=>route.fulfill({status:400,json:{error:'invalid_grant',error_description:'Email not confirmed'}}));
 await page.route('**/.netlify/identity/signup',route=>route.fulfill({json:{id:'test-unconfirmed',email:'confirmation@example.com',user_metadata:{}}}));
 await page.goto('/');
 await page.getByRole('button',{name:'Sign in to your account',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Email address').fill('confirmation@example.com');
 await dialog.getByLabel('Password',{exact:true}).fill('example-password-only');
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(dialog.getByRole('heading',{name:'Confirm your email.'})).toBeVisible();
 await expect(dialog.getByLabel('Email address')).toHaveValue('confirmation@example.com');
 await expect(dialog).not.toContainText('invalid_grant');
 await dialog.getByRole('button',{name:'Resend confirmation email'}).click();
 await expect(dialog.getByRole('status')).toContainText('Confirmation requested');
 await dialog.getByRole('button',{name:'Back to sign in'}).click();
 await expect(dialog.getByRole('heading',{name:'Welcome to your workspace.'})).toBeVisible();
});

test('inventory records stock through the saved purchase workflow and reloads the balance',async({page,isMobile})=>{
 const business='00000000-0000-4000-8000-000000000001';
 const product={id:'00000000-0000-4000-8000-000000000002',name:'Test stock item',sku:'TEST-STOCK',kind:'product',price:'1500.00',cost:'0.00',quantity:0,reorder_level:5};
 const account={id:'inventory-test-user',email:'inventory@example.com',confirmed_at:'2026-01-01T00:00:00Z',user_metadata:{full_name:'Inventory Test'}};
 let posted:any;
 await page.route('**/.netlify/identity/token*',route=>route.fulfill({json:{access_token:'synthetic-test-token',refresh_token:'synthetic-test-refresh',expires_in:3600,token_type:'bearer',user:account}}));
 await page.route('**/.netlify/identity/user',route=>route.fulfill({json:account}));
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());
  const resource=url.pathname.replace('/api/','');
  if(resource==='transactions'&&route.request().method()==='POST'){
   posted=route.request().postDataJSON();
   product.quantity+=posted.quantity;product.cost='800.00';
   return route.fulfill({status:201,json:{id:'saved-stock-purchase',...posted}});
  }
  const responses:Record<string,unknown>={connection:{configured:true},workspaces:[{id:business,name:'Inventory test business',role:'owner'}],snapshot:{products:[product],transactions:posted?[{id:'saved-stock-purchase',...posted}]:[]},overview:{},reports:{}};
  return route.fulfill({json:responses[resource]??{}});
 });
 await page.goto('/');
 await page.getByRole('button',{name:'Sign in to your account',exact:true}).click();
 const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Email address').fill(account.email);
 await dialog.getByLabel('Password',{exact:true}).fill('synthetic-test-password');
 await dialog.getByRole('button',{name:'Sign in',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 await navigate(page,'Inventory & products',isMobile);
 await page.getByRole('button',{name:'Record stock for Test stock item',exact:true}).click();
 await expect(dialog.getByLabel('Stock product')).toHaveValue(product.id);
 await dialog.getByLabel('Total stock cost (TZS)').fill('5600');
 const quantity=dialog.getByLabel('Quantity to add to stock');
 await quantity.fill('0');
 expect(await quantity.evaluate((input:HTMLInputElement)=>input.checkValidity())).toBe(false);
 await quantity.fill('7');
 await expect(quantity).toBeFocused();
 await dialog.getByRole('button',{name:'Save record',exact:true}).click();
 await expect(dialog).not.toBeVisible();
 expect(posted).toMatchObject({kind:'purchase',product_id:product.id,quantity:7,amount:5600});
 expect(posted.idempotency_key).toMatch(/^[0-9a-f-]{36}$/);
 const row=page.getByRole('row').filter({has:page.getByText(product.name,{exact:true})});
 await expect(row.getByRole('cell').nth(3)).toHaveText('7');
 await page.reload();
 await navigate(page,'Inventory & products',isMobile);
 await expect(row.getByRole('cell').nth(3)).toHaveText('7');
});

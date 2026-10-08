import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@angular/core';
import { PRODUCTS } from './demo-data';
import { BomItem, createNewProjectDraft, FreeTextBomItem } from './models';
import { freeTextInput, pendingProduct, projectBomCsv, projectBomRow, resolveProduct, validPendingProduct, validateFreeText } from './project-bom';
import { LOCAL_PROJECTS_KEY, ProjectService } from './project.service';
const input = (name = 'Roof') => ({ ...createNewProjectDraft(), name, classification: 'residential' as const, configuration: 'hybrid' as const, workScope: 'new-installation' as const });
const textInput = () => ({ title: 'Cable', description: 'External sourcing', unit: 'meter', quantity: 25, notes: 'Copper' });

describe('project BOM local writes and pricing', () => {
  beforeEach(() => { const values = new Map<string,string>(); vi.stubGlobal('localStorage', { getItem: (key:string) => values.get(key) ?? null, setItem:(key:string,value:string) => values.set(key,value) }); });
  afterEach(() => vi.unstubAllGlobals());
  it('atomically creates a project with its initial product and retries without an orphan or duplicate', async () => {
    const service = new ProjectService(signal(PRODUCTS));
    const storage = vi.spyOn(localStorage,'setItem').mockImplementation(() => { throw new Error('quota'); });
    expect((await service.create(input(), 'request', pendingProduct(PRODUCTS[0], 200))).ok).toBe(false);
    expect(service.projects()).toHaveLength(0);
    storage.mockRestore();
    expect((await service.create(input(), 'request', pendingProduct(PRODUCTS[0], 200))).ok).toBe(true);
    (await service.create(input(), 'request', pendingProduct(PRODUCTS[0], 200)));
    expect(service.projects()).toHaveLength(1);
    expect(service.projects()[0].bom.items).toHaveLength(1);
    expect(service.projects()[0].bom.items[0].quantity).toBe(200);
    expect(service.activeProject()).toBeNull();
  });
  it('keeps repeated products as separate identities, idempotent retries, and other projects unchanged', async () => {
    const service = new ProjectService(signal(PRODUCTS)); (await service.create(input('One'),'one')); (await service.create(input('Two'),'two'));
    const one = service.projects()[0]; const two = service.projects()[1]; (await service.setActive(one.id));
    const pending = pendingProduct(PRODUCTS[4], 1000);
    expect((await service.addProduct(two.id,pending,'addition')).ok).toBe(true);
    (await service.addProduct(two.id,pending,'addition')); (await service.addProduct(two.id,pending,'another'));
    const items = service.projects()[1].bom.items;
    expect(items).toHaveLength(2); expect(items[0].id).not.toBe(items[1].id);
    expect(items[0].quantity).toBe(1000); expect(service.projects()[0]).toEqual(one);
    expect(service.activeProject()?.id).toBe(one.id);
    expect(new ProjectService(signal(PRODUCTS)).projects()[1].bom.items).toEqual(items);
    expect(localStorage.getItem('solar.bom.v1')).toBeNull();
  });
  it('rejects missing/variant/unit-mismatched products and unsafe quantities at confirmation', async () => {
    const service = new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one')); const id=service.projects()[0].id;
    const pending=pendingProduct(PRODUCTS[0]);
    for (const candidate of [ { ...pending,quantity:0 }, { ...pending,quantity:1.5 }, { ...pending,quantity:Number.MAX_SAFE_INTEGER+1 }, { ...pending,product:{...pending.product,productId:'gone'} }, { ...pending,product:{...pending.product,variantId:'unavailable'} }, { ...pending,product:{...pending.product,unitCode:'pallet'} } ]) {
      expect((await service.addProduct(id,candidate,'request')).ok).toBe(false);
      expect((await service.create(input(),'new',candidate)).ok).toBe(false);
    }
    expect(service.projects()).toHaveLength(1); expect(service.projects()[0].bom.items).toHaveLength(0);
  });
  it('validates and persists free text, preserving identity and creation timestamp on edit', async () => {
    const service=new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one')); const id=service.projects()[0].id;
    expect(validateFreeText(freeTextInput())).toHaveProperty('title');
    expect((await service.saveFreeText(id,{...textInput(),unit:''},'bad')).ok).toBe(false);
    (await service.saveFreeText(id,textInput(),'text')); (await service.saveFreeText(id,textInput(),'text'));
    const before=service.projects()[0].bom.items[0] as FreeTextBomItem;
    expect(before.estimate).toEqual({kind:'unpriced'});
    (await service.saveFreeText(id,{...textInput(),title:' Copper cable ',quantity:30},'edit',before.id));
    const after=service.projects()[0].bom.items[0] as FreeTextBomItem;
    expect(after.id).toBe(before.id); expect(after.createdAt).toBe(before.createdAt); expect(after.title).toBe('Copper cable'); expect(after.quantity).toBe(30);
    expect(new ProjectService(signal(PRODUCTS)).projects()[0].bom.items[0]).toEqual(after);
  });
  it('keeps saved values unchanged on failed edit/removal and supports undo without reordering', async () => {
    const service=new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one')); const id=service.projects()[0].id;
    (await service.addProduct(id,pendingProduct(PRODUCTS[0]),'one')); (await service.saveFreeText(id,textInput(),'text'));
    const items=service.projects()[0].bom.items;
    const write=vi.spyOn(localStorage,'setItem').mockImplementation(()=>{throw new Error('quota');});
    expect((await service.setItemQuantity(id,items[0].id,2000)).ok).toBe(false);
    expect((await service.removeItem(id,items[0].id)).ok).toBe(false);
    expect((await service.saveFreeText(id,{...textInput(),title:'Changed'},'edit',items[1].id)).ok).toBe(false);
    expect(service.projects()[0].bom.items).toEqual(items);
    write.mockRestore(); (await service.removeItem(id,items[0].id)); expect(service.projects()[0].bom.items).toHaveLength(1);
    (await service.restoreItem(id,items[0],0)); expect(service.projects()[0].bom.items).toEqual(items);
    expect((await service.restoreItem(id,items[0],0)).ok).toBe(false);
  });
  it('keeps archived projects read-only and flags missing product references without dropping them', async () => {
    const service=new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one',pendingProduct(PRODUCTS[0])));
    const envelope=JSON.parse(localStorage.getItem(LOCAL_PROJECTS_KEY)!);
    envelope.projects[0].bom.items[0].product.productId='gone';
    envelope.projects[0].status='archived'; envelope.projects[0].archivedAt=new Date().toISOString();
    localStorage.setItem(LOCAL_PROJECTS_KEY,JSON.stringify(envelope));
    const restored=new ProjectService(signal(PRODUCTS)); const project=restored.projects()[0];
    expect(project.bom.items).toHaveLength(1); expect(projectBomRow(project.bom.items[0], PRODUCTS).total).toBeNull();
    expect((await restored.addProduct(project.id,pendingProduct(PRODUCTS[0]),'new')).ok).toBe(false);
    expect((await restored.setItemQuantity(project.id,project.bom.items[0].id,3)).ok).toBe(false);
    expect((await restored.saveFreeText(project.id,textInput(),'new')).ok).toBe(false);
    expect((await restored.removeItem(project.id,project.bom.items[0].id)).ok).toBe(false);
  });
  it('rejects stale-tab additions without overwriting newly saved BOM contents', async () => {
    const service=new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one')); const stale=new ProjectService(signal(PRODUCTS)); const id=service.projects()[0].id;
    (await service.addProduct(id,pendingProduct(PRODUCTS[0]),'new')); const stored=localStorage.getItem(LOCAL_PROJECTS_KEY);
    expect((await stale.addProduct(id,pendingProduct(PRODUCTS[1]),'stale')).ok).toBe(false);
    expect(localStorage.getItem(LOCAL_PROJECTS_KEY)).toBe(stored);
  });
  it('exports line types, unknown blanks and formula-safe free text with separate pricing provenance', async () => {
    const service=new ProjectService(signal(PRODUCTS)); (await service.create(input(),'one',pendingProduct(PRODUCTS[0],31))); const id=service.projects()[0].id;
    (await service.saveFreeText(id,{...textInput(),title:'=1+1',description:'A,"quoted"\ntext'},'text'));
    const items=service.projects()[0].bom.items;
    expect(projectBomRow(items[0], PRODUCTS).unitPrice).toBe(5890); expect(projectBomRow(items[1], PRODUCTS).unitPrice).toBeNull();
    const csv=projectBomCsv(items, PRODUCTS);
    expect(csv).toContain('store-product'); expect(csv).toContain('free-text'); expect(csv).toContain("'=1+1"); expect(csv).toContain('A,""quoted""\ntext'); expect(csv).toContain('"","","Unpriced requirement');
    expect(projectBomRow({...items[0],quantity:Number.MAX_SAFE_INTEGER} as BomItem, PRODUCTS).total).toBeNull();
  });
  it('resolves arbitrary published UUID references, uses a flat tax-unknown price, and marks withdrawn products unavailable', async () => {
    const id = '11111111-1111-4111-8111-111111111111';
    const product = { ...PRODUCTS[0], id, sku: 'PUBLIC-UUID', source: 'published' as const, price: 123.45, amountMinor: 12345, publishedVersion: 7, tiers: [] };
    const pending = pendingProduct(product, 40);
    expect(resolveProduct(pending.product, [product])).toBe(product);
    expect(validPendingProduct(pending, [product])).toBe(true);
    expect(resolveProduct(pending.product)).toBeUndefined();
    expect((await new ProjectService(signal([])).create(input(), 'no-fixture-fallback', pending)).ok).toBe(false);
    const service = new ProjectService(signal([product]));
    expect((await service.create(input(), 'published', pending)).ok).toBe(true);
    const item = service.projects()[0].bom.items[0];
    const row = projectBomRow(item, [product]);
    expect(row.unitPrice).toBe(123.45);
    expect(row.total).toBe(4938);
    expect(row.pricing).toContain('tax unspecified');
    expect(resolveProduct(item.kind === 'store-product' ? item.product : pending.product, [])).toBeUndefined();
    expect(projectBomRow(item, []).total).toBeNull();
  });
});

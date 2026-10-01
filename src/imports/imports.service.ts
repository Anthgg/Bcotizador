import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { AuditService } from '../common/audit.service';
import { jsonSafe } from '../common/json';
import { PrismaService } from '../common/prisma.service';
import { ProductType, ImportStatus, InventoryMovementType } from '../generated/prisma/enums';

type SheetRow = Record<string, any> & { __row: number };
type UploadedWorkbook = { originalname: string; buffer: Buffer; size: number };
type Issue = { sheet: string; rowNumber?: number; severity: 'ERROR'|'WARNING'|'AMBIGUOUS'; code: string; message: string };
const key = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const clean = (value: any) => value == null || String(value).trim() === '' ? null : String(value).trim();
const number = (value: any): string | null => {
  if (value == null || String(value).trim() === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? String(n) : null;
};
const bool = (value: any, fallback = false) => {
  if (value == null || String(value).trim() === '') return fallback;
  const v = key(value);
  return ['si','sí','yes','true','1','activo','verdadero'].includes(v);
};
const rowValue = (row: SheetRow, ...names: string[]) => {
  const wanted = new Set(names.map(key));
  for (const [k, v] of Object.entries(row)) if (wanted.has(key(k))) return v;
  return null;
};
const categoryDisplayName = (row: SheetRow) => clean(rowValue(row, 'Nombre a mostrar')) ?? clean(rowValue(row, 'Categoria'));
const categoryParentDisplayName = (name: string) => {
  const parts = name.split(/\s*\/\s*/).filter(Boolean);
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : null;
};
const categoryDepth = (name: string) => name.split(/\s*\/\s*/).filter(Boolean).length;
const inferProductType = (row: SheetRow, recipeOutputNames: Set<string>): ProductType | null => {
  const name = clean(rowValue(row, 'Nombre'));
  const category = clean(rowValue(row, 'Categoria de producto'));
  if (!category) return null;
  if (name && recipeOutputNames.has(key(name))) return ProductType.PREPARED_MATERIAL;
  const path = category.split(/\s*\/\s*/).map(key);
  if (path[0] === 'insumos taller') return ProductType.RAW_MATERIAL;
  if (path[0] === 'servicios') return ProductType.SERVICE;
  if (path.includes('esmaltes')) return ProductType.PREPARED_MATERIAL;
  if (path[0] === 'productos terminados taller') return ProductType.FINISHED_PRODUCT;
  return null;
};
const normalizedRows = (workbook: XLSX.WorkBook, sheetAliases: string[]): SheetRow[] => {
  const wanted = new Set(sheetAliases.map(key));
  const sheetName = workbook.SheetNames.find(name => wanted.has(key(name)));
  if (!sheetName) return [];
  const values = XLSX.utils.sheet_to_json<Record<string, any>>(workbook.Sheets[sheetName], { defval: null, raw: true });
  return values.map((row, index) => ({ ...row, __row: index + 2 })).filter(row => Object.entries(row).some(([k,v]) => k !== '__row' && v != null && String(v).trim() !== ''));
};
const normalizePreview = (preview: any) => {
  if (!preview || typeof preview !== 'object') return preview;
  const { count, ...rest } = preview;
  return { ...rest, counts: preview.counts ?? count ?? {} };
};

@Injectable()
export class ImportsService {
  constructor(private prisma: PrismaService, private audit: AuditService) {}

  private parse(buffer: Buffer) {
    let wb: XLSX.WorkBook;
    try { wb = XLSX.read(buffer, { type: 'buffer', cellDates: true }); }
    catch { throw new BadRequestException('El archivo no es un XLSX válido'); }
    const products = normalizedRows(wb, ['Productos']);
    const contacts = normalizedRows(wb, ['Proveedores y clientes']);
    const categories = normalizedRows(wb, ['Categoria de producto']);
    const posCategories = normalizedRows(wb, ['Categoria en Punto de venta']);
    const recipeRows = normalizedRows(wb, ['Recetas']);
    const stock = normalizedRows(wb, ['Stock']);
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    for (const [sheet, rows] of [['Productos',products],['Proveedores y clientes',contacts],['Categoria de producto',categories],['Categoria en Punto de venta',posCategories],['Recetas',recipeRows],['Stock',stock]] as [string,SheetRow[]][]) {
      if (!rows.length) errors.push({ sheet, severity: 'ERROR', code: 'SHEET_MISSING_OR_EMPTY', message: 'No se encontró la hoja o está vacía' });
    }
    const recipeGroups: any[] = [];
    const productNames = new Set(products.map(row => key(rowValue(row, 'Nombre'))));
    let current: any = null;
    let skippingConflictedRecipe = false;
    for (const row of recipeRows) {
      const outputName = clean(rowValue(row, 'Nombre del producto a preparar'));
      const yieldQuantity = number(rowValue(row, 'Cantidad'));
      const yieldUnit = clean(rowValue(row, 'Unidad de medida del producto preparado'));
      const ingredientName = clean(rowValue(row, 'Insumo'));
      const ingredientQuantity = number(rowValue(row, 'Cantidad del insumo'));
      const ingredientUnit = clean(rowValue(row, 'Unidad de medida del insumo'));
      if (yieldQuantity != null) {
        skippingConflictedRecipe = false;
        current = { outputName, yieldQuantity, yieldUnit, rowNumber: row.__row, items: [] };
        recipeGroups.push(current);
        if (!outputName || !yieldUnit) errors.push({ sheet: 'Recetas', rowNumber: row.__row, severity: 'ERROR', code: 'RECIPE_HEADER_INCOMPLETE', message: 'La fila inicial de receta requiere producto preparado y unidad de rendimiento' });
      } else if (skippingConflictedRecipe) {
        continue;
      } else if (outputName && productNames.has(key(outputName))) {
        warnings.push({
          sheet: 'Recetas',
          rowNumber: row.__row,
          severity: 'WARNING',
          code: 'SOURCE_CONFLICT',
          message: `La fila ${row.__row} inicia una receta para "${outputName}" sin cantidad de rendimiento. Se omitirá este bloque hasta la siguiente receta válida para no mezclar sus ingredientes con la receta anterior.`,
        });
        current = null;
        skippingConflictedRecipe = true;
        continue;
      } else if (!current) {
        if (ingredientName) errors.push({ sheet: 'Recetas', rowNumber: row.__row, severity: 'ERROR', code: 'RECIPE_CONTINUATION_WITHOUT_HEADER', message: 'Ingrediente sin una receta inicial con cantidad de rendimiento' });
        continue;
      }
      if (!current) continue;
      // Continuation rows may repeat literal 268 in columns A/C; only B starts a recipe.
      if (ingredientName && ingredientQuantity != null && ingredientUnit) {
        current.items.push({ ingredientName, quantity: ingredientQuantity, unit: ingredientUnit, rowNumber: row.__row });
      } else if (ingredientName) {
        errors.push({ sheet: 'Recetas', rowNumber: row.__row, severity: 'ERROR', code: 'RECIPE_ITEM_INCOMPLETE', message: 'La fila de ingrediente requiere cantidad y unidad' });
      }
    }
    const rowsBySheet = { products, contacts, categories, posCategories, recipeRows, recipeGroups, stock };
    return { workbook: wb, rowsBySheet, errors, warnings };
  }

  private async previewCounts(parsed: ReturnType<ImportsService['parse']>) {
    const { products, contacts, categories, posCategories, recipeGroups, stock } = parsed.rowsBySheet;
    const existingProducts = await this.prisma.product.findMany({ select: { id:true, name:true, internalReference:true, salePrice:true, unitCost:true, unit:true } });
    const existingContacts = await this.prisma.contact.findMany({ select: { id:true, displayName:true, identificationNumber:true, email:true } });
    const existingCategories = await this.prisma.productCategory.findMany({ select: { id:true,name:true } });
    const existingPos = await this.prisma.posCategory.findMany({ select: { id:true,name:true } });
    const categoryPaths = new Set(existingCategories.map(category => key(category.name)));
    for (const row of categories) {
      const path = categoryDisplayName(row);
      if (path) categoryPaths.add(key(path));
    }
    const recipeOutputNames = new Set(recipeGroups.map(recipe => key(recipe.outputName)));
    const errors = [...parsed.errors];
    const warnings: Issue[] = [...(parsed.warnings ?? [])];
    const ambiguities: Issue[] = [];
    const refSeen = new Map<string, number>();
    const count = { products: { total:products.length, new:0, updated:0, unchanged:0 }, contacts:{total:contacts.length,new:0,updated:0,unchanged:0}, categories:{total:categories.length,new:0,updated:0}, posCategories:{total:posCategories.length,new:0,updated:0}, recipes:{total:recipeGroups.length,new:0,updated:0,costIncomplete:0}, stockRows:{total:stock.length,matched:0,unresolved:0} };

    for (const row of products) {
      const name = clean(rowValue(row,'Nombre')), ref = clean(rowValue(row,'Referencia interna'));
      if (!name) { errors.push({ sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'PRODUCT_NAME_REQUIRED',message:'Falta el nombre del producto' }); continue; }
      const category = clean(rowValue(row, 'Categoria de producto'));
      if (!category) errors.push({ sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'PRODUCT_CATEGORY_REQUIRED',message:'Falta la categoría del producto' });
      else if (!categoryPaths.has(key(category))) errors.push({ sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'UNRESOLVED_PRODUCT_CATEGORY',message:'No existe una categoría con la ruta del producto: ' + category });
      if (!inferProductType(row, recipeOutputNames)) errors.push({ sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'PRODUCT_TYPE_UNRESOLVED',message:'No se pudo clasificar el producto a partir de su categoría y sus relaciones de receta' });
      if (ref) {
        const normalizedRef=key(ref);
        if (refSeen.has(normalizedRef)) ambiguities.push({ sheet:'Productos',rowNumber:row.__row,severity:'AMBIGUOUS',code:'DUPLICATE_INTERNAL_REFERENCE',message:'La referencia interna aparece más de una vez en el archivo' });
        refSeen.set(normalizedRef,row.__row);
      }
      const match = ref ? existingProducts.find(p => key(p.internalReference)===key(ref)) : null;
      if (!match) count.products.new++;
      else if (match.name===name && String(match.salePrice??'')===String(number(rowValue(row,'Precio de venta'))??'') && String(match.unitCost??'')===String(number(rowValue(row,'Costo'))??'')) count.products.unchanged++;
      else count.products.updated++;
      if (number(rowValue(row,'Costo')) == null) warnings.push({ sheet:'Productos',rowNumber:row.__row,severity:'WARNING',code:'COST_MISSING',message:'El producto quedará sin costo y el cotizador lo marcará COST_INCOMPLETE cuando corresponda' });
    }
    for (const row of categories) {
      const name=categoryDisplayName(row);
      if (!name) errors.push({sheet:'Categoria de producto',rowNumber:row.__row,severity:'ERROR',code:'CATEGORY_NAME_REQUIRED',message:'Falta nombre de categoría'});
      else if (existingCategories.some(c=>key(c.name)===key(name))) count.categories.updated++; else count.categories.new++;
    }
    for (const row of posCategories) {
      const name=clean(rowValue(row,'Nombre'));
      if (!name) errors.push({sheet:'Categoria en Punto de venta',rowNumber:row.__row,severity:'ERROR',code:'POS_CATEGORY_NAME_REQUIRED',message:'Falta nombre de categoría PdV'});
      else if (existingPos.some(c=>key(c.name)===key(name))) count.posCategories.updated++; else count.posCategories.new++;
    }
    for (const row of contacts) {
      const name=clean(rowValue(row,'Nombre'));
      if (!name) { errors.push({sheet:'Proveedores y clientes',rowNumber:row.__row,severity:'ERROR',code:'CONTACT_NAME_REQUIRED',message:'Falta el nombre del contacto'}); continue; }
      const doc=clean(rowValue(row,'Número de indentificación','Número de identificación'));
      const email=clean(rowValue(row,'Correo'));
      const match=doc ? existingContacts.find(c=>key(c.identificationNumber)===key(doc)) : email ? existingContacts.find(c=>key(c.email)===key(email)) : existingContacts.find(c=>key(c.displayName)===key(name));
      if (!match) count.contacts.new++; else count.contacts.updated++;
      warnings.push({sheet:'Proveedores y clientes',rowNumber:row.__row,severity:'WARNING',code:'CONTACT_ROLE_UNSPECIFIED',message:'La hoja no distingue proveedor de cliente; se importa como contacto sin asignar rol comercial'});
    }
    const existingRecipeOutputs = await this.prisma.recipe.findMany({ include: { outputProduct: true } });
    const existingByName = new Map<string, any[]>();
    for (const p of existingProducts) { const k=key(p.name); existingByName.set(k,[...(existingByName.get(k)??[]),p]); }
    const incomingByName = new Map<string, SheetRow[]>();
    for (const p of products) { const k=key(rowValue(p,'Nombre')); incomingByName.set(k,[...(incomingByName.get(k)??[]),p]); }
    const resolveProduct = (name: string) => {
      const existing=existingByName.get(key(name))??[], incoming=incomingByName.get(key(name))??[];
      if (existing.length>1 || (existing.length===0 && incoming.length>1)) return {match:null,ambiguous:true};
      if (existing.length===1) return {match:existing[0],ambiguous:false};
      if (incoming.length===1) return {match:{name:rowValue(incoming[0],'Nombre'),unitCost:number(rowValue(incoming[0],'Costo')),unit:rowValue(incoming[0],'Unidad de medida')},ambiguous:false};
      return {match:null,ambiguous:false};
    };
    const oldRecipeNames=new Set(existingRecipeOutputs.map(r=>key(r.outputProduct.name)));
    for (const recipe of recipeGroups) {
      if (!recipe.outputName) continue;
      const output=resolveProduct(recipe.outputName);
      if (output.ambiguous) ambiguities.push({sheet:'Recetas',rowNumber:recipe.rowNumber,severity:'AMBIGUOUS',code:'AMBIGUOUS_RECIPE_OUTPUT',message:'Hay más de un producto con el mismo nombre para la salida de receta'});
      else if (!output.match) errors.push({sheet:'Recetas',rowNumber:recipe.rowNumber,severity:'ERROR',code:'UNRESOLVED_RECIPE_OUTPUT',message:'No existe producto maestro para la salida de receta: '+recipe.outputName});
      if (oldRecipeNames.has(key(recipe.outputName))) count.recipes.updated++; else count.recipes.new++;
      for (const item of recipe.items) {
        const ingredient=resolveProduct(item.ingredientName);
        if (ingredient.ambiguous) ambiguities.push({sheet:'Recetas',rowNumber:item.rowNumber,severity:'AMBIGUOUS',code:'AMBIGUOUS_RECIPE_INGREDIENT',message:'Hay más de un producto maestro para el ingrediente: '+item.ingredientName});
        else if (!ingredient.match) errors.push({sheet:'Recetas',rowNumber:item.rowNumber,severity:'ERROR',code:'UNRESOLVED_RECIPE_INGREDIENT',message:'No existe producto maestro para el ingrediente: '+item.ingredientName});
        else if (ingredient.match.unitCost == null) { count.recipes.costIncomplete++; warnings.push({sheet:'Recetas',rowNumber:item.rowNumber,severity:'WARNING',code:'RECIPE_COST_INCOMPLETE',message:'Falta costo de ingrediente '+item.ingredientName}); }
      }
    }
    const productNames = new Map<string, number>();
    for (const p of existingProducts) productNames.set(key(p.name),(productNames.get(key(p.name))??0)+1);
    for (const p of products) productNames.set(key(rowValue(p,'Nombre')),(productNames.get(key(rowValue(p,'Nombre')))??0)+1);
    for (const row of stock) {
      const name=clean(rowValue(row,'Producto'));
      const matches=productNames.get(key(name))??0;
      if (matches===1) count.stockRows.matched++;
      else {
        count.stockRows.unresolved++;
        const issue={sheet:'Stock',rowNumber:row.__row,severity:'AMBIGUOUS' as const,code:matches===0?'UNRESOLVED_STOCK_PRODUCT':'AMBIGUOUS_STOCK_PRODUCT',message:matches===0?'No existe producto maestro para el saldo: '+name:'Hay más de un producto maestro para el saldo: '+name};
        ambiguities.push(issue);
      }
    }
    return { count, errors, warnings, ambiguities };
  }

  async preview(file: UploadedWorkbook, actorId: string) {
    if (!file?.buffer?.length) throw new BadRequestException('Selecciona un archivo XLSX');
    if (!/\.xlsx$/i.test(file.originalname)) throw new BadRequestException('Solo se admite un archivo .xlsx');
    const sha256=createHash('sha256').update(file.buffer).digest('hex');
    const previous=await this.prisma.importBatch.findUnique({where:{sha256}});
    if (previous) return { data: { batchId:previous.id,fileName:previous.fileName,sha256,status:previous.status,alreadyUploaded:true,...normalizePreview(previous.preview as any) } };
    const parsed=this.parse(file.buffer);
    const analysis=await this.previewCounts(parsed);
    const preview={detectedSheets:parsed.workbook.SheetNames,counts:analysis.count,errors:analysis.errors,warnings:analysis.warnings,ambiguities:analysis.ambiguities};
    const rawData=jsonSafe(parsed.rowsBySheet);
    try {
      return await this.prisma.$transaction(async tx=>{
        const batch=await tx.importBatch.create({data:{fileName:file.originalname,sha256,status:ImportStatus.PREVIEW,preview:jsonSafe(preview),rawData,createdById:actorId}});
        const issues=[...analysis.errors,...analysis.warnings,...analysis.ambiguities];
        if(issues.length) await tx.importError.createMany({data:issues.map(issue=>({batchId:batch.id,sheet:issue.sheet,rowNumber:issue.rowNumber,severity:issue.severity,code:issue.code,message:issue.message}))});
        await this.audit.write(actorId,'CREATE','ImportBatch',batch.id,null,{fileName:batch.fileName,sha256,status:batch.status,counts:analysis.count},tx);
        return {data:{batchId:batch.id,fileName:batch.fileName,sha256,status:batch.status,alreadyUploaded:false,...preview}};
      });
    } catch (error:any) {
      if(error?.code==='P2002'){
        const batch=await this.prisma.importBatch.findUnique({where:{sha256}});
        if(batch) return {data:{batchId:batch.id,fileName:batch.fileName,sha256,status:batch.status,alreadyUploaded:true,...(batch.preview as any)}};
      }
      throw error;
    }
  }

  async list() {
    const data=await this.prisma.importBatch.findMany({select:{id:true,fileName:true,sha256:true,status:true,preview:true,confirmedAt:true,createdAt:true},orderBy:{createdAt:'desc'},take:50});
    return {data};
  }
  async get(id:string) {
    const batch=await this.prisma.importBatch.findUnique({where:{id},include:{errors:{orderBy:{rowNumber:'asc'}}}});
    if(!batch) throw new NotFoundException('Importación no encontrada');
    return {data:batch};
  }

  async confirm(id:string,actorId:string) {
    return this.prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "ImportBatch" WHERE "id" = ${id} FOR UPDATE`;
      const batch=await tx.importBatch.findUnique({where:{id}});
      if(!batch) throw new NotFoundException('Importación no encontrada');
      if(batch.status===ImportStatus.CONFIRMED) return {data:{batchId:id,status:batch.status,alreadyConfirmed:true,preview:normalizePreview(batch.preview as any)}};
      const raw=batch.rawData as any;
      const rows=raw as {products:SheetRow[];contacts:SheetRow[];categories:SheetRow[];posCategories:SheetRow[];recipeGroups:any[];stock:SheetRow[]};
      const issues:Issue[]=[];
      const recipeOutputNames=new Set((rows.recipeGroups??[]).map(recipe=>key(recipe.outputName)));
      const categoryIds=new Map<string,string>();
      const categoryRows: {row:SheetRow;name:string;parentName:string|null}[]=[];
      for(const row of rows.categories??[]){
        const name=categoryDisplayName(row); if(!name) continue;
        categoryRows.push({row,name,parentName:categoryParentDisplayName(name)});
      }
      categoryRows.sort((a,b)=>categoryDepth(a.name)-categoryDepth(b.name));
      for(const {row,name,parentName} of categoryRows){
        let parentId:string|null=null;
        if(parentName){
          parentId=categoryIds.get(key(parentName))??(await tx.productCategory.findUnique({where:{name:parentName}}))?.id??null;
          if(!parentId){issues.push({sheet:'Categoria de producto',rowNumber:row.__row,severity:'ERROR',code:'UNRESOLVED_CATEGORY_PARENT',message:'No existe la categoría padre '+parentName+' para '+name});continue;}
        }
        const before=await tx.productCategory.findUnique({where:{name}});
        const after=await tx.productCategory.upsert({where:{name},create:{name,parentId},update:{parentId}});
        categoryIds.set(key(name),after.id);
        await this.audit.write(actorId,before?'UPDATE':'CREATE','ProductCategory',after.id,before,after,tx);
      }
      const posIds=new Map<string,string>();
      for(const row of rows.posCategories??[]){
        const name=clean(rowValue(row,'Nombre'));if(!name)continue;
        const parentName=clean(rowValue(row,'Categoria padre'));
        const parentId=parentName?(posIds.get(key(parentName))??(await tx.posCategory.findUnique({where:{name:parentName}}))?.id??null):null;
        const before=await tx.posCategory.findUnique({where:{name}});
        const after=await tx.posCategory.upsert({where:{name},create:{name,parentId},update:{parentId}});
        posIds.set(key(name),after.id);
        await this.audit.write(actorId,before?'UPDATE':'CREATE','PosCategory',after.id,before,after,tx);
      }
      for(const row of rows.contacts??[]){
        const name=clean(rowValue(row,'Nombre'));if(!name)continue;
        const doc=clean(rowValue(row,'Número de indentificación','Número de identificación'));
        const email=clean(rowValue(row,'Correo'));
        const where=doc?{identificationNumber:doc}:null;
        const before=where?await tx.contact.findUnique({where:where as any}):email?await tx.contact.findFirst({where:{email}}):await tx.contact.findFirst({where:{displayName:name}});
        const data:any={
          displayName:name,identificationType:clean(rowValue(row,'Tipo de identificación')),
          identificationNumber:doc,street:clean(rowValue(row,'Calle')),district:clean(rowValue(row,'distrito')),
          province:clean(rowValue(row,'provincia')),department:clean(rowValue(row,'Departamento')),
          country:clean(rowValue(row,'país','pais')),email,phone:clean(rowValue(row,'Celular')),
          bankAccount:clean(rowValue(row,'Número de cuenta')),bankName:clean(rowValue(row,'Banco')),
        };
        const after=before?await tx.contact.update({where:{id:before.id},data}):await tx.contact.create({data});
        await this.audit.write(actorId,before?'UPDATE':'CREATE','Contact',after.id,before,after,tx);
      }
      for(const row of rows.products??[]){
        const name=clean(rowValue(row,'Nombre')); if(!name)continue;
        const reference=clean(rowValue(row,'Referencia interna'));
        const catName=clean(rowValue(row,'Categoria de producto'));
        if(!catName){issues.push({sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'PRODUCT_CATEGORY_REQUIRED',message:'Falta la categoría del producto'});continue;}
        const categoryId=categoryIds.get(key(catName))??(await tx.productCategory.findUnique({where:{name:catName}}))?.id??null;
        if(!categoryId){issues.push({sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'UNRESOLVED_PRODUCT_CATEGORY',message:'No existe una categoría con la ruta del producto: '+catName});continue;}
        const productType=inferProductType(row,recipeOutputNames);
        if(!productType){issues.push({sheet:'Productos',rowNumber:row.__row,severity:'ERROR',code:'PRODUCT_TYPE_UNRESOLVED',message:'No se pudo clasificar el producto a partir de su categoría y sus relaciones de receta'});continue;}
        const posName=clean(rowValue(row,'Categoria PdV'));
        const before=reference?await tx.product.findUnique({where:{internalReference:reference}}):await tx.product.findFirst({where:{name}});
        if(!reference&&!before){
          const same=await tx.product.findMany({where:{name},take:2});
          if(same.length>1){issues.push({sheet:'Productos',rowNumber:row.__row,severity:'AMBIGUOUS',code:'AMBIGUOUS_PRODUCT_NAME',message:'No se importa producto con nombre duplicado sin referencia'});continue;}
        }
        const unit=clean(rowValue(row,'Unidad de medida'))??'unit';
        const purchaseUnit=clean(rowValue(row,'Unidad de medida de compra'));
        const unitCost=number(rowValue(row,'Costo'));
        const costBasis=key(purchaseUnit??unit);
        let costPerGram:string|null=null;
        if(unitCost!=null){
          if(['g','gramo','gramos','gram'].includes(costBasis))costPerGram=unitCost;
          else if(['kg','kilogramo','kilogramos'].includes(costBasis))costPerGram=String(Number(unitCost)/1000);
        }
        const posCategory=posName?await tx.posCategory.findUnique({where:{name:posName}}):null;
        const data:any={
          internalReference:reference,name,productType,
          categoryId,posCategoryId:posCategory?.id??null,
          salesTax:number(rowValue(row,'Impuesto venta')),purchaseTax:number(rowValue(row,'Impuesto de compra')),
          canSell:bool(rowValue(row,'¿Se puede vender?'),true),canBuy:bool(rowValue(row,'¿Se puede comprar?')),
          posAvailable:bool(rowValue(row,'Disponible en punto de venta?')),
          salePrice:number(rowValue(row,'Precio de venta')),unitCost,costPerGram,costUnit:costBasis,unit,purchaseUnit,
        };
        const after=before?await tx.product.update({where:{id:before.id},data}):await tx.product.create({data});
        await this.audit.write(actorId,before?'UPDATE':'CREATE','Product',after.id,before,after,tx);
      }
      const allProducts=await tx.product.findMany({select:{id:true,name:true,productType:true}});
      const byName=new Map<string,any[]>();
      for(const p of allProducts)byName.set(key(p.name),[...(byName.get(key(p.name))??[]),p]);
      for(const recipe of rows.recipeGroups??[]){
        const outputMatches=byName.get(key(recipe.outputName))??[];
        if(outputMatches.length!==1){issues.push({sheet:'Recetas',rowNumber:recipe.rowNumber,severity:'AMBIGUOUS',code:outputMatches.length?'AMBIGUOUS_RECIPE_OUTPUT':'UNRESOLVED_RECIPE_OUTPUT',message:'No se pudo resolver el producto preparado '+recipe.outputName});continue;}
        const output=outputMatches[0], items:any[]=[];let unresolved=false;
        for(const item of recipe.items??[]){
          const matches=byName.get(key(item.ingredientName))??[];
          if(matches.length!==1){issues.push({sheet:'Recetas',rowNumber:item.rowNumber,severity:'AMBIGUOUS',code:matches.length?'AMBIGUOUS_RECIPE_INGREDIENT':'UNRESOLVED_RECIPE_INGREDIENT',message:'No se pudo resolver el ingrediente '+item.ingredientName});unresolved=true;break;}
          items.push({ingredientProductId:matches[0].id,quantity:item.quantity,unit:item.unit});
        }
        if(unresolved)continue;
        if(output.productType!==ProductType.PREPARED_MATERIAL){
          const beforeProduct=await tx.product.findUnique({where:{id:output.id}});
          const afterProduct=await tx.product.update({where:{id:output.id},data:{productType:ProductType.PREPARED_MATERIAL}});
          await this.audit.write(actorId,'UPDATE','Product',output.id,beforeProduct,afterProduct,tx);
        }
        const before=await tx.recipe.findUnique({where:{outputProductId:output.id},include:{items:true}});
        const after=await tx.recipe.upsert({
          where:{outputProductId:output.id},
          create:{outputProductId:output.id,yieldQuantity:recipe.yieldQuantity,yieldUnit:recipe.yieldUnit,items:{create:items}},
          update:{yieldQuantity:recipe.yieldQuantity,yieldUnit:recipe.yieldUnit,items:{deleteMany:{},create:items}},
          include:{items:true},
        });
        await this.audit.write(actorId,before?'UPDATE':'CREATE','Recipe',after.id,before,after,tx);
      }
      const locationByName=new Map<string,string>();
      for(const row of rows.stock??[]){
        const productName=clean(rowValue(row,'Producto'));
        const matches=byName.get(key(productName))??[];
        if(matches.length!==1){issues.push({sheet:'Stock',rowNumber:row.__row,severity:'AMBIGUOUS',code:matches.length?'AMBIGUOUS_STOCK_PRODUCT':'UNRESOLVED_STOCK_PRODUCT',message:'Saldo sin producto maestro asociado: '+productName});continue;}
        const qty=number(rowValue(row,'Cantidad'));
        if(qty==null){issues.push({sheet:'Stock',rowNumber:row.__row,severity:'ERROR',code:'STOCK_QUANTITY_INVALID',message:'Cantidad de stock inválida'});continue;}
        const locationName=clean(rowValue(row,'Ubicación'))??'Principal';
        let locationId=locationByName.get(key(locationName));
        if(!locationId){const location=await tx.location.upsert({where:{name:locationName},create:{name:locationName},update:{}});locationId=location.id;locationByName.set(key(locationName),location.id);}
        const sourceKey=batch.sha256+':stock:'+row.__row;
        const before=await tx.inventoryMovement.findUnique({where:{sourceKey}});
        if(before)continue;
        const movement=await tx.inventoryMovement.create({data:{
          productId:matches[0].id,locationId,type:InventoryMovementType.OPENING_BALANCE,
          quantity:qty,unit:clean(rowValue(row,'Unidad de medida'))??'unit',
          reason:'Importación de saldo inicial '+batch.fileName,sourceKey,importBatchId:id,actorId,
        }});
        await this.audit.write(actorId,'CREATE','InventoryMovement',movement.id,null,movement,tx);
      }
      if(issues.length)await tx.importError.createMany({data:issues.map(issue=>({batchId:id,sheet:issue.sheet,rowNumber:issue.rowNumber,severity:issue.severity,code:issue.code,message:issue.message}))});
      const after=await tx.importBatch.update({where:{id},data:{status:ImportStatus.CONFIRMED,confirmedAt:new Date()}});
      await this.audit.write(actorId,'CONFIRM','ImportBatch',id,{status:batch.status},{status:after.status,counts:(batch.preview as any)?.count,addedErrors:issues.length},tx);
      return {data:{batchId:id,status:after.status,alreadyConfirmed:false,preview:normalizePreview(batch.preview as any),confirmErrors:issues}};
    },{timeout:180000});
  }
}

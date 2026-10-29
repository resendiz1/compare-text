const codeOriginal = `function calcularTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].precio;
  }
  return total;
}

function aplicarDescuento(total, porcentaje) {
  return total - (total * porcentaje / 100);
}
`;

const codeModified = `function calcularTotal(items) {
  return items.reduce((total, item) => total + item.precio, 0);
}

function aplicarDescuento(total, porcentaje) {
  if (porcentaje < 0 || porcentaje > 100) {
    throw new Error('Porcentaje no válido');
  }
  const descuento = total * porcentaje / 100;
  return total - descuento;
}

function formatearPrecio(valor) {
  return valor.toFixed(2) + ' €';
}
`;

const articleOriginal = `La comparación de textos es una tarea habitual en la revisión de documentos.
Permite detectar cambios entre dos versiones de un mismo contenido.
Sin embargo, revisar manualmente archivos extensos puede ser lento y propenso a errores.

Una buena herramienta debe resaltar las diferencias con claridad.
También debe ofrecer una vista unificada y otra lado a lado.
El usuario necesita controlar qué diferencias desea revisar.

Además, el procesamiento local protege la información sensible.
Los textos no deberían enviarse a servidores externos.
`;

const articleModified = `La comparación de textos es una tarea esencial en la revisión de documentos.
Permite detectar cambios entre dos versiones de un mismo contenido.
Revisar manualmente archivos extensos puede ser lento y propenso a errores.

Una buena herramienta debe resaltar las diferencias con claridad.
También debe ofrecer una vista unificada y otra lado a lado.
El usuario necesita controlar qué diferencias desea revisar y filtrarlas.

Además, el procesamiento local protege la información sensible.
Los textos nunca deberían enviarse a servidores externos.
Esta aplicación funciona por completo en el navegador.
`;

const identicalText = `Un comparador de textos permite revisar dos versiones de un documento.
El resultado debe ser claro, rápido y fácil de interpretar.
Esta herramienta procesa todo localmente en el navegador.
`;

const tasksOriginal = `- Comprar leche
- Revisar el correo
- Terminar el informe
- Llamar al cliente
- Preparar la reunión
`;

const tasksModified = `- Comprar leche
- Revisar el correo electrónico
- Terminar el informe mensual
- Preparar la reunión
- Enviar el presupuesto
- Reservar la sala
`;

export const examples = [
  {
    id: 'code',
    titleKey: 'examples.code.title',
    descKey: 'examples.code.desc',
    original: codeOriginal,
    modified: codeModified,
  },
  {
    id: 'article',
    titleKey: 'examples.article.title',
    descKey: 'examples.article.desc',
    original: articleOriginal,
    modified: articleModified,
  },
  {
    id: 'identical',
    titleKey: 'examples.identical.title',
    descKey: 'examples.identical.desc',
    original: identicalText,
    modified: identicalText,
  },
  {
    id: 'tasks',
    titleKey: 'examples.tasks.title',
    descKey: 'examples.tasks.desc',
    original: tasksOriginal,
    modified: tasksModified,
  },
];

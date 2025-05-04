const express = require('express');
const app = express();
const { db } = require('../firebase');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
require('dotenv').config();

const transporter = nodemailer.createTransport({
  SES: {
    ses: new (require('@aws-sdk/client-ses').SESClient)({
      region: process.env.AWS_REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      },
    }),
    aws: require('@aws-sdk/client-ses'),
  },
});

const sendEmailToPay = async (req, res) => {
  const orderId = generateOrderId();
  const transactionDate = new Date();
  let transactionData;

  try {
    const { items, total, gymId, profileId } = req.body;

    if (!items || !total || !gymId || !profileId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const [profileDoc, gymDoc] = await Promise.all([
      admin.firestore().collection('profiles').doc(profileId).get(),
      admin.firestore().collection('gyms').doc(gymId).get(),
    ]);

    if (!profileDoc.exists || !gymDoc.exists) {
      return res.status(404).json({ error: 'Profile or gym not found' });
    }

    const profile = profileDoc.data();
    const gym = gymDoc.data();

    transactionData = {
      orderId,
      transactionId: `TRX-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: admin.firestore.Timestamp.fromDate(transactionDate),
      items: items.map((item) => ({
        productId: item.productId,
        name: item.productName,
        model: item.model,
        color: item.color?.name || 'N/A',
        colorCode: item.color?.code,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
        imageUrl: item.imageUrl,
        customization: item.customization || null,
      })),
      totalAmount: total,
      status: 'pending_payment',
      paymentMethod: 'viva_wallet_link',
      customer: {
        profileId,
        name: `${profile.profileName} ${profile.profileLastname}`,
        email: profile.profileEmail,
        phone: profile.profileTelephoneNumber || 'N/A',
      },
      gym: {
        gymId,
        name: gym.gymName,
        location: gym.gymAddress || 'N/A',
      },
      metadata: {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      },
      timestamps: {
        created: admin.firestore.FieldValue.serverTimestamp(),
        updated: admin.firestore.FieldValue.serverTimestamp(),
      },
    };

    await admin
      .firestore()
      .collection('storeTransactions')
      .doc(transactionData.transactionId)
      .set(transactionData);

    const customerEmail = {
      from: '"No Reply - NeoApp" <no-reply@neoappgym.com>',
      to: profile.profileEmail,
      subject: `Order Confirmation #${orderId}`,
      html: generateCustomerEmail(orderId, transactionData),
    };

    const adminEmail = {
      from: '"No Reply - NeoApp" <no-reply@neoappgym.com>',
      to: 'info@neo-app.eu',
      bcc: 'goneoapp@gmail.com',
      subject: `New Order #${orderId} - €${total.toFixed(2)}`,
      html: generateAdminEmail(orderId, transactionData),
    };

    await Promise.all([
      transporter.sendMail(customerEmail),
      transporter.sendMail(adminEmail),
    ]);

    res.status(200).json({
      success: true,
      orderId,
      transactionId: transactionData.transactionId,
    });
  } catch (error) {
    console.error('Transaction error:', error);

    res.status(500).json({
      success: false,
      error: 'Transaction processing failed',
      details: error.message,
    });
  }
};

function generateCustomerEmail(orderId, transaction) {
  return `
    <h2>Order #${orderId} Confirmation</h2>
    <p>Dear ${transaction.customer.name},</p>
    <p>Thank you for your order! We are currently processing your request, and you will receive a payment link shortly. Please keep an eye on your email for further instructions.</p>
    <p>Date: ${transaction.date.toDate().toLocaleString()}</p>
    ${generateOrderTable(transaction.items, transaction.totalAmount)}
    <p>If you have any questions, feel free to contact us.</p>
    <p>Best regards,<br><strong>NeoApp Gym Team</strong></p>
  `;
}

// Genera un ID de orden único (ORD-{timestamp}-{random})
const generateOrderId = () => {
  const now = new Date();

  // Formato: ORD-YYYYMMDDHHMMSS-RRRR
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const random = Math.floor(Math.random() * 10000)
    .toString()
    .padStart(4, '0');

  return `ORD-${timestamp}-${random}`;
};

function generateOrderTable(items, total) {
  return `
    <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr>
          <th>Product</th>
          <th>Model</th>
          <th>Color</th>
          <th>Color Code</th>
          <th>Size</th>
          <th>Qty</th>
          <th>Price</th>
          <th>Customization</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map((item) => {
            let customizationDetails = item.customization
              ? `
              ${item.customization.addGymLogo ? '✔ Gym Logo' : '✖ Gym Logo'}<br>
              ${item.customization.addName ? '✔ Name' : '✖ Name'}<br>
              ${
                item.customization.nameText
                  ? `Text: ${item.customization.nameText}`
                  : ''
              }
            `
              : 'N/A';

            return `
          <tr>
            <td>${item.name}</td>
            <td>${item.model}</td>
            <td>${item.color}</td>
            <td>${item.colorCode || 'N/A'}</td>
            <td>${item.size || 'N/A'}</td>
            <td>${item.quantity}</td>
            <td>€${item.price}</td>
            <td>${customizationDetails}</td>
          </tr>
        `;
          })
          .join('')}
      </tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="7" style="text-align: right;">Total:</td>
          <td>€${total.toFixed(2)}</td>
        </tr>
      </tfoot>
    </table>
  `;
}

// Corregir `generateAdminEmail`
function generateAdminEmail(orderId, transaction) {
  return `
    <h2>New Order #${orderId} - €${transaction.totalAmount.toFixed(2)}</h2>
    <p>Date: ${transaction.date.toDate().toLocaleString()}</p>
    <p>Customer: ${transaction.customer.name} (${
    transaction.customer.email
  })</p>
    <p>Gym: ${transaction.gym.name}</p>
    ${generateOrderTable(transaction.items, transaction.totalAmount)}
    <p>Payment Method: ${transaction.paymentMethod}</p>
  `;
}

// Función para obtener los productos (con paginación o filtros si es necesario)
const getProducts = async (req, res) => {
  const { page, limit } = req.query; // Obtenemos 'page' y 'limit' desde los parámetros de la consulta
  const gymId = req.query.gymId; // Se espera que el gymId venga en la query

  if (!gymId) {
    return res.status(400).json({ error: 'Gym ID is required' });
  }

  try {
    // Asegúrate de que 'page' y 'limit' son números válidos
    const pageNum = parseInt(page) || 1; // Si no se proporciona, por defecto es la página 1
    const limitNum = parseInt(limit) || 10; // Si no se proporciona, por defecto es 10 productos por página

    // Calcular el número de documentos a saltar en función de la página actual y el límite
    const offset = (pageNum - 1) * limitNum;

    // Referencia a la colección de productos dentro de la subcolección de visibilidad del gimnasio
    const gymProductsRef = admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .collection('products'); // Subcolección de productos del gimnasio

    // Obtenemos los IDs de los productos visibles (isVisible: true)
    const visibleProductsSnapshot = await gymProductsRef.get();

    // Si no hay productos visibles, respondemos con un mensaje adecuado
    if (visibleProductsSnapshot.empty) {
      return res.status(404).json({ message: 'No visible products found.' });
    }

    // Extraemos los IDs de los productos visibles
    const productIds = visibleProductsSnapshot.docs.map((doc) => doc.id);

    // Ahora consultamos la colección 'products' para obtener los detalles completos de los productos visibles
    const productsRef = admin.firestore().collection('products');
    const productsSnapshot = await productsRef
      .where(admin.firestore.FieldPath.documentId(), 'in', productIds) // Filtramos por los IDs de productos visibles
      .orderBy('name') // Si deseas ordenar por el nombre del producto
      .offset(offset) // Paginación: saltamos los productos de las páginas anteriores
      .limit(limitNum) // Limitamos la cantidad de productos por página
      .get();

    const products = productsSnapshot.docs.map((doc) => {
      const productData = doc.data(); // Los datos del producto
      const gymProduct = visibleProductsSnapshot.docs.find(
        (visibleDoc) => visibleDoc.id === doc.id
      );
      return {
        id: doc.id,
        ...productData,
        isVisible: gymProduct.data().isVisible,
      };
    });

    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }

    const totalVisibleProducts = visibleProductsSnapshot.size;
    const totalPages = Math.ceil(totalVisibleProducts / limitNum);

    return res.status(200).json({
      products,
      currentPage: pageNum,
      totalPages: totalPages,
      totalProducts: totalVisibleProducts,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

const getMobileProductsByTarget = async (req, res) => {
  const { page, limit, target, category, gymId } = req.query;

  if (!gymId) {
    return res.status(400).json({ error: 'Gym ID is required' });
  }

  if (!target) {
    return res.status(400).json({ error: 'Target is required' });
  }

  if (target !== 'All' && !['Men', 'Women', 'Unisex'].includes(target)) {
    return res
      .status(400)
      .json({ error: 'Target must be All, Men, Women, or Unisex' });
  }

  if (!category) {
    return res.status(400).json({ error: 'Category is required' });
  }

  try {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const gymProductsRef = admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .collection('products');

    // Obtenemos solo productos visibles
    const visibleProductsSnapshot = await gymProductsRef
      .where('isVisible', '==', true)
      .get();

    if (visibleProductsSnapshot.empty) {
      return res.status(404).json({
        message: 'No visible products found.',
      });
    }

    const productIds = visibleProductsSnapshot.docs.map((doc) => doc.id);

    // Referencia a colección principal
    const productsRef = admin.firestore().collection('products');
    let query = productsRef
      .where(admin.firestore.FieldPath.documentId(), 'in', productIds)
      .where('category', '==', category);

    // Aplicar filtro de target si no es 'All'
    if (target !== 'All') {
      query = query.where('target', '==', target);
    }

    query = query.orderBy('name').offset(offset).limit(limitNum);

    const productsSnapshot = await query.get();

    const products = productsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    const totalMatchingProducts = products.length;
    const totalPages = Math.ceil(totalMatchingProducts / limitNum);

    return res.status(200).json({
      products,
      currentPage: pageNum,
      totalPages,
      totalProducts: totalMatchingProducts,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

const getMobileProducts = async (req, res) => {
  const { page, limit } = req.query; // Obtenemos 'page' y 'limit' desde los parámetros de la consulta
  const gymId = req.query.gymId; // Se espera que el gymId venga en la query

  if (!gymId) {
    return res.status(400).json({ error: 'Gym ID is required' });
  }

  try {
    // Asegúrate de que 'page' y 'limit' son números válidos
    const pageNum = parseInt(page) || 1; // Si no se proporciona, por defecto es la página 1
    const limitNum = parseInt(limit) || 10; // Si no se proporciona, por defecto es 10 productos por página

    // Calcular el número de documentos a saltar en función de la página actual y el límite
    const offset = (pageNum - 1) * limitNum;

    // Referencia a la colección de productos dentro de la subcolección de visibilidad del gimnasio
    const gymProductsRef = admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .collection('products'); // Subcolección de productos del gimnasio

    // Obtenemos los IDs de los productos visibles (isVisible: true)
    const visibleProductsSnapshot = await gymProductsRef
      .where('isVisible', '==', true)
      .get();

    // Si no hay productos visibles, respondemos con un mensaje adecuado
    if (visibleProductsSnapshot.empty) {
      return res.status(404).json({ message: 'No visible products found.' });
    }

    // Extraemos los IDs de los productos visibles
    const productIds = visibleProductsSnapshot.docs.map((doc) => doc.id);

    // Ahora consultamos la colección 'products' para obtener los detalles completos de los productos visibles
    const productsRef = admin.firestore().collection('products');
    const productsSnapshot = await productsRef
      .where(admin.firestore.FieldPath.documentId(), 'in', productIds) // Filtramos por los IDs de productos visibles
      .orderBy('name') // Si deseas ordenar por el nombre del producto
      .offset(offset) // Paginación: saltamos los productos de las páginas anteriores
      .limit(limitNum) // Limitamos la cantidad de productos por página
      .get();

    const products = productsSnapshot.docs.map((doc) => {
      const productData = doc.data(); // Los datos del producto
      const gymProduct = visibleProductsSnapshot.docs.find(
        (visibleDoc) => visibleDoc.id === doc.id
      );
      return {
        id: doc.id,
        ...productData,
        isVisible: gymProduct.data().isVisible,
      };
    });

    if (products.length === 0) {
      return res.status(404).json({ message: 'No products found.' });
    }

    const totalVisibleProducts = visibleProductsSnapshot.size;
    const totalPages = Math.ceil(totalVisibleProducts / limitNum);

    return res.status(200).json({
      products,
      currentPage: pageNum,
      totalPages: totalPages,
      totalProducts: totalVisibleProducts,
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    return res.status(500).json({ error: 'Failed to fetch products.' });
  }
};

const getAvailableColors = async (req, res) => {
  try {
    const { productId } = req.params; // Obtener el productId de la URL

    // 1. Verificar que el producto exista
    const productRef = admin.firestore().collection('products').doc(productId);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
      return res.status(404).json({
        success: false,
        message: 'Product not found',
      });
    }

    // 2. Obtener todos los colores disponibles de la subcolección AvailableColors
    const availableColorsSnapshot = await productRef
      .collection('availableColors')
      .get();

    // 3. Obtener los detalles completos de cada color
    const colorPromises = [];
    const availableColorsData = [];

    availableColorsSnapshot.forEach((doc) => {
      const colorData = doc.data();
      if (colorData.colorId) {
        colorPromises.push(
          admin
            .firestore()
            .collection('colors')
            .doc(colorData.colorId)
            .get()
            .then((colorDoc) => {
              if (colorDoc.exists) {
                availableColorsData.push({
                  id: colorData.colorId,
                  ...colorDoc.data(),
                  // Puedes incluir también campos específicos de AvailableColors si es necesario
                  availableColorId: doc.id,
                  ...colorData,
                });
              }
            })
        );
      }
    });

    await Promise.all(colorPromises);

    // 4. Enviar respuesta con los colores disponibles y sus detalles
    res.status(200).json({
      success: true,
      availableColors: availableColorsData,
    });
  } catch (error) {
    console.error('Error fetching available colors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve available colors',
      error: error.message,
    });
  }
};

const updateProductVisibility = async (req, res) => {
  const { productId } = req.params;
  const { gymId, isVisible } = req.body;

  try {
    if (!gymId || typeof isVisible !== 'boolean') {
      return res
        .status(400)
        .json({ error: 'GymId and isVisible are required.' });
    }

    const productRef = admin
      .firestore()
      .collection('gyms')
      .doc(gymId)
      .collection('products')
      .doc(productId);

    await productRef.update({
      isVisible: isVisible,
    });

    return res
      .status(200)
      .json({ message: 'Product visibility updated successfully.' });
  } catch (error) {
    console.error('Error updating product visibility:', error);
    return res
      .status(500)
      .json({ error: 'Failed to update product visibility.' });
  }
};

module.exports = {
  getProducts,
  getMobileProducts,
  getMobileProductsByTarget,
  updateProductVisibility,
  getAvailableColors,
  sendEmailToPay,
};

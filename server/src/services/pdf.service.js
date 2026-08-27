const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

/**
 * Generates a tailored PDF resume from JSON data.
 * 
 * @param {object} resumeJson 
 * @param {string} outputPath 
 * @returns {Promise<string>}
 */
function generateResumePdf(resumeJson, outputPath) {
  return new Promise((resolve, reject) => {
    try {
      // Ensure target folder exists
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const doc = new PDFDocument({
        size: 'A4',
        margin: 40
      });

      const writeStream = fs.createWriteStream(outputPath);
      doc.pipe(writeStream);

      // Color Palette (Clean Executive Navy & Slate Slate)
      const primaryColor = '#0f172a';   // Slate 900
      const secondaryColor = '#475569'; // Slate 600
      const textColor = '#334155';      // Slate 700
      const dividerColor = '#cbd5e1';   // Slate 300

      // 1. Header (Name, Title, Contact Info)
      doc.font('Helvetica-Bold')
         .fontSize(20)
         .fillColor(primaryColor)
         .text(resumeJson.personalInfo.name, { align: 'center' });
      doc.moveDown(0.15);

      doc.font('Helvetica')
         .fontSize(10.5)
         .fillColor(secondaryColor)
         .text(resumeJson.personalInfo.title, { align: 'center' });
      doc.moveDown(0.15);

      const contactItems = [
        resumeJson.personalInfo.email,
        resumeJson.personalInfo.phone,
        resumeJson.personalInfo.location,
        resumeJson.personalInfo.github,
        resumeJson.personalInfo.linkedin
      ].filter(Boolean);

      doc.font('Helvetica')
         .fontSize(8.5)
         .fillColor(secondaryColor)
         .text(contactItems.join('   |   '), { align: 'center' });
      doc.moveDown(0.5);

      // Divider line below header
      doc.strokeColor(dividerColor)
         .lineWidth(1)
         .moveTo(40, doc.y)
         .lineTo(555, doc.y)
         .stroke();
      doc.moveDown(0.6);

      // Helper function to draw sections
      const drawSectionHeader = (title) => {
        doc.font('Helvetica-Bold')
           .fontSize(11.5)
           .fillColor(primaryColor)
           .text(title.toUpperCase());
        doc.moveDown(0.15);
        doc.strokeColor(dividerColor)
           .lineWidth(0.5)
           .moveTo(40, doc.y)
           .lineTo(555, doc.y)
           .stroke();
        doc.moveDown(0.4);
      };

      // 2. Summary
      drawSectionHeader('Professional Summary');
      doc.font('Helvetica')
         .fontSize(9.5)
         .fillColor(textColor)
         .text(resumeJson.summary, { align: 'justify', lineGap: 1.5 });
      doc.moveDown(0.7);

      // 3. Technical Skills
      drawSectionHeader('Technical Skills');
      Object.entries(resumeJson.skills).forEach(([category, list]) => {
        doc.font('Helvetica-Bold')
           .fontSize(9.5)
           .fillColor(textColor)
           .text(category + ': ', { continued: true })
           .font('Helvetica')
           .fillColor(textColor)
           .text(list.join(', '));
        doc.moveDown(0.25);
      });
      doc.moveDown(0.5);

      // 4. Experience
      drawSectionHeader('Professional Experience');
      resumeJson.experience.forEach(job => {
        const startY = doc.y;
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(primaryColor)
           .text(job.role, { continued: true })
           .font('Helvetica')
           .fontSize(10)
           .fillColor(secondaryColor)
           .text(`   at ${job.company}`);

        doc.font('Helvetica-Oblique')
           .fontSize(9)
           .fillColor(secondaryColor)
           .text(job.duration, 40, startY, { align: 'right', width: 515 });
        doc.moveDown(0.25);

        job.highlights.forEach(bullet => {
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(`•   ${bullet}`, { indent: 10, lineGap: 1.2 });
          doc.moveDown(0.15);
        });
        doc.moveDown(0.35);
      });
      doc.moveDown(0.35);

      // 5. Key Projects
      if (resumeJson.projects && resumeJson.projects.length > 0) {
        drawSectionHeader('Key Projects');
        resumeJson.projects.forEach(project => {
          doc.font('Helvetica-Bold')
             .fontSize(10)
             .fillColor(primaryColor)
             .text(project.title, { continued: true })
             .font('Helvetica')
             .fontSize(9)
             .fillColor(secondaryColor)
             .text(`   [${project.techStack}]`);
          doc.moveDown(0.25);

          project.highlights.forEach(bullet => {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(textColor)
               .text(`•   ${bullet}`, { indent: 10, lineGap: 1.2 });
            doc.moveDown(0.15);
          });
          doc.moveDown(0.35);
        });
        doc.moveDown(0.35);
      }

      // 6. Education
      drawSectionHeader('Education');
      resumeJson.education.forEach(edu => {
        const startY = doc.y;
        doc.font('Helvetica-Bold')
           .fontSize(10)
           .fillColor(primaryColor)
           .text(edu.degree, { continued: true })
           .font('Helvetica')
           .fontSize(10)
           .fillColor(secondaryColor)
           .text(`   - ${edu.institution}`);

        doc.font('Helvetica-Oblique')
           .fontSize(9)
           .fillColor(secondaryColor)
           .text(edu.duration, 40, startY, { align: 'right', width: 515 });
        
        if (edu.details) {
          doc.moveDown(0.15);
          doc.font('Helvetica')
             .fontSize(9)
             .fillColor(textColor)
             .text(edu.details, { indent: 10 });
        }
        doc.moveDown(0.35);
      });

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', (err) => reject(err));
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = { generateResumePdf };
